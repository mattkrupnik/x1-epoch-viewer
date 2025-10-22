##!/bin/bash
#
#VOTE_PUBKEY="GrD4uZHWwXaT1yLYmaDJZtSa8tBNNCa5fLZp3zPkyN2P"
#RPC_URL="https://rpc.mainnet.x1.xyz"
#
## Pobierz dane o walidatorze
#DATA=$(curl -s -X POST $RPC_URL \
#  -H "Content-Type: application/json" \
#  -d '{"jsonrpc":"2.0","id":1,"method":"getVoteAccounts"}')
#
## Wyciągnij rekord walidatora (działa dla current i delinquent)
#VALIDATOR=$(echo "$DATA" | jq -r --arg VOTE "$VOTE_PUBKEY" '
#  (.result.current[]?, .result.delinquent[]?) | select(.votePubkey == $VOTE)
#')
#
#if [ -z "$VALIDATOR" ]; then
#  echo "Nie znaleziono walidatora o votePubkey=$VOTE_PUBKEY"
#  exit 1
#fi
#
## Pobierz dane epochCredits
#EPOCH_CREDITS=$(echo "$VALIDATOR" | jq '.epochCredits')
#
## Liczba stake accounts
#STAKE_ACCOUNTS=$(echo "$EPOCH_CREDITS" | jq 'length')
#
## Ostatnie dwie epoki
#LAST_TWO=$(echo "$EPOCH_CREDITS" | jq '[.[-2], .[-1]]')
#
#CREDITS_PREV=$(echo "$LAST_TWO" | jq '.[0][1]')
#CREDITS_LAST=$(echo "$LAST_TWO" | jq '.[1][1]')
#EPOCH_LAST=$(echo "$LAST_TWO" | jq '.[1][0]')
#
## Suma przyrostów credits dla wszystkich stake accounts
#VOTES_CAST=$((CREDITS_LAST - CREDITS_PREV))
#
## Pobierz liczbę slotów w epoce
#SLOTS_IN_EPOCH=$(curl -s -X POST $RPC_URL \
#  -H "Content-Type: application/json" \
#  -d '{"jsonrpc":"2.0","id":1,"method":"getEpochInfo"}' | jq '.result.slotsInEpoch')
#
## Oblicz performance w procentach
##PERFORMANCE=$(awk -v v="$VOTES_CAST" -v s="$SLOTS_IN_EPOCH" -v n="$STAKE_ACCOUNTS" \
##  'BEGIN { printf "%.2f", (v / (s * n)) * 100 }')
#PERFORMANCE=$(awk -v v="$VOTES_CAST" -v s="$SLOTS_IN_EPOCH" -v n="$STAKE_ACCOUNTS" \
#  'BEGIN { p=(v / (s * n)) * 100; if(p>100) p=100; printf "%.2f", p }')
#
#echo "Epoch: $EPOCH_LAST"
#echo "Votes cast (sum of all stake accounts): $VOTES_CAST"
#echo "Number of stake accounts: $STAKE_ACCOUNTS"
#echo "Expected votes per account (slots in epoch): $SLOTS_IN_EPOCH"
#echo "Vote performance: $PERFORMANCE%"

#!/usr/bin/env bash

RPC="https://rpc.mainnet.x1.xyz"
VOTE_KEY="GrD4uZHWwXaT1yLYmaDJZtSa8tBNNCa5fLZp3zPkyN2P"
SELF_KEY="<TWÓJ_KLUCZ_STAKE/WITHDRAW>"

curl "$RPC" \
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
            \"memcmp\": {
              \"offset\": 124,
              \"bytes\": \"$VOTE_KEY\"
            }
          }
        ]
      }
    ]
  }" \
  | jq --arg SELF "$SELF_KEY" '
      .result[]
      | {
          stake_pubkey: .pubkey,
          delegated_stake: .account.data.parsed.info.stake.delegation.stake,
          stake_authority: .account.data.parsed.info.stake.authorized.staker,
          withdraw_authority: .account.data.parsed.info.stake.authorized.withdrawer,
          self_stake:
            (
              .account.data.parsed.info.stake.authorized.staker == $SELF
              or
              .account.data.parsed.info.stake.authorized.withdrawer == $SELF
            )
        }
    '
