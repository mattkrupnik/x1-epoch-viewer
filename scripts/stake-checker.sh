#!/usr/bin/env bash

RPC="https://rpc.mainnet.x1.xyz"
VOTE="$1"
IDENTITY="$2"

if [ -z "$VOTE" ] || [ -z "$IDENTITY" ]; then
echo "Użycie: ./stake_checker.sh <VOTE_ACCOUNT> <IDENTITY_KEY>"
exit 1
fi

VOTE_INFO=$(curl -s "$RPC" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"getAccountInfo\",
    \"params\": [\"$VOTE\", {\"encoding\": \"jsonParsed\"}]
}")

VOTE_WITHDRAWER=$(echo "$VOTE_INFO" | jq -r '.result.value.data.parsed.info.authorizedWithdrawer // empty')

RAW=$(curl -s "$RPC" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"getProgramAccounts\",
    \"params\": [
      \"Stake11111111111111111111111111111111111111\",
{
\"encoding\": \"jsonParsed\",
        \"filters\": [
  {
  \"memcmp\": { \"offset\": 124, \"bytes\": \"$VOTE\" }
  }
]
}
]
}")

if ! echo "$RAW" | jq -e .result >/dev/null 2>&1; then
echo "$RAW"
exit 1
fi

echo "$RAW" | jq --arg ID "$IDENTITY" --arg VOTE "$VOTE" --arg VW "$VOTE_WITHDRAWER" '
    .result[]
| {
  stake_pubkey: .pubkey,
  delegated_stake_sol: (.account.data.parsed.info.stake.delegation.stake | tonumber / 1000000000),
stake_authority: .account.data.parsed.info.meta.authorized.staker,
    withdraw_authority: .account.data.parsed.info.meta.authorized.withdrawer,
    self_stake:
(
    .account.data.parsed.info.meta.authorized.staker == $ID
or .account.data.parsed.info.meta.authorized.staker == $VOTE
or .account.data.parsed.info.meta.authorized.withdrawer == $ID
or ($VW != "" and .account.data.parsed.info.meta.authorized.withdrawer == $VW)
)
}
'
