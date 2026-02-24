import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

const MONITORED_VALIDATORS_KEY = "monitoredAddresses";
const PORTFOLIO_WALLETS_KEY = "portfolioWallets";
const ACTIVE_ADDRESS_KEY_STORAGE = "activeAddressKey";
const LAST_SAVED_SNAPSHOT_STORAGE = "addressKeyLastSavedSnapshot";
const LAST_KEY_TIMESTAMP_STORAGE = "addressKeyLastTimestamp";
const ADDRESS_LISTS_UPDATED_EVENT = "address-lists-updated";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type WalletEntry = { address: string; accountType: "vote" | "stake" | "wallet" };

function normalizeAddresses(addresses: string[]): string[] {
  return Array.from(
    new Set(
      addresses
        .map((item) => item.trim())
        .filter((item) => Boolean(item) && BASE58_RE.test(item))
    )
  );
}

function buildSnapshot(validators: string[], wallets: string[]): string {
  return JSON.stringify({
    validators: [...normalizeAddresses(validators)].sort(),
    wallets: [...normalizeAddresses(wallets)].sort(),
  });
}

function readValidators(): string[] {
  try {
    const raw = localStorage.getItem(MONITORED_VALIDATORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeAddresses(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return [];
  }
}

function readWalletEntries(): WalletEntry[] {
  try {
    const raw = localStorage.getItem(PORTFOLIO_WALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    if (parsed.length > 0 && typeof parsed[0] === "string") {
      return normalizeAddresses(parsed.filter((item): item is string => typeof item === "string")).map((address) => ({
        address,
        accountType: "wallet",
      }));
    }

    return Array.from(
      new Map(
        parsed
          .filter((item) => item && typeof item.address === "string")
          .map((item) => {
            const address = String(item.address).trim();
            const accountType = item.accountType === "vote" || item.accountType === "stake" ? item.accountType : "wallet";
            return [address, { address, accountType }];
          })
      ).values()
    ).filter((entry) => BASE58_RE.test(entry.address));
  } catch {
    return [];
  }
}

export const AddressKeysDialog = () => {
  const [open, setOpen] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeAddressKey, setActiveAddressKey] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [lastKeyTimestamp, setLastKeyTimestamp] = useState("");
  const [validators, setValidators] = useState<string[]>([]);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);

  const walletAddresses = useMemo(() => wallets.map((wallet) => wallet.address), [wallets]);
  const currentSnapshot = useMemo(() => buildSnapshot(validators, walletAddresses), [validators, walletAddresses]);
  const hasKey = Boolean(activeAddressKey);
  const isDirty = hasKey && lastSavedSnapshot !== currentSnapshot;
  const totalItems = validators.length + walletAddresses.length;

  const syncFromStorage = () => {
    setValidators(readValidators());
    setWallets(readWalletEntries());
    setActiveAddressKey(localStorage.getItem(ACTIVE_ADDRESS_KEY_STORAGE) || "");
    setLastSavedSnapshot(localStorage.getItem(LAST_SAVED_SNAPSHOT_STORAGE) || "");
    setLastKeyTimestamp(localStorage.getItem(LAST_KEY_TIMESTAMP_STORAGE) || "");
  };

  useEffect(() => {
    syncFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === MONITORED_VALIDATORS_KEY ||
        event.key === PORTFOLIO_WALLETS_KEY ||
        event.key === ACTIVE_ADDRESS_KEY_STORAGE ||
        event.key === LAST_SAVED_SNAPSHOT_STORAGE ||
        event.key === LAST_KEY_TIMESTAMP_STORAGE
      ) {
        syncFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (open) {
      syncFromStorage();
    } else {
      setImportKey("");
      setCopied(false);
    }
  }, [open]);

  const persistKeyState = (key: string, snapshot: string, timestamp?: string) => {
    localStorage.setItem(ACTIVE_ADDRESS_KEY_STORAGE, key);
    localStorage.setItem(LAST_SAVED_SNAPSHOT_STORAGE, snapshot);
    setActiveAddressKey(key);
    setLastSavedSnapshot(snapshot);
    if (timestamp) {
      localStorage.setItem(LAST_KEY_TIMESTAMP_STORAGE, timestamp);
      setLastKeyTimestamp(timestamp);
    }
  };

  const notifyListsUpdated = () => {
    window.dispatchEvent(new CustomEvent(ADDRESS_LISTS_UPDATED_EVENT));
  };

  const saveList = async () => {
    if (totalItems === 0) {
      toast.error("Add validators or wallets before saving");
      return;
    }

    setSaving(true);
    try {
      const payload = { validators: normalizeAddresses(validators), wallets: normalizeAddresses(walletAddresses) };
      const result = await api.createAddressKey(payload);
      persistKeyState(result.key, buildSnapshot(payload.validators, payload.wallets), result.createdAt);
      notifyListsUpdated();
      toast.success("Address key created");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save list");
    } finally {
      setSaving(false);
    }
  };

  const updateList = async () => {
    if (!activeAddressKey) {
      toast.error("No active key to update");
      return;
    }

    setSaving(true);
    try {
      const payload = { validators: normalizeAddresses(validators), wallets: normalizeAddresses(walletAddresses) };
      const result = await api.updateAddressKey(activeAddressKey, payload);
      persistKeyState(result.key, buildSnapshot(payload.validators, payload.wallets), result.updatedAt);
      notifyListsUpdated();
      toast.success("Address key updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update list");
    } finally {
      setSaving(false);
    }
  };

  const importList = async () => {
    const key = importKey.trim();
    if (!key) {
      toast.error("Enter a key");
      return;
    }

    setImporting(true);
    try {
      const result = await api.getAddressKey(key);
      const importedValidators = normalizeAddresses(result.validators || []);
      const importedWallets = normalizeAddresses(result.wallets || []);

      const currentValidators = readValidators();
      const validatorsSet = new Set(currentValidators);
      const validatorsToAdd = importedValidators.filter((address) => !validatorsSet.has(address));
      localStorage.setItem(MONITORED_VALIDATORS_KEY, JSON.stringify([...currentValidators, ...validatorsToAdd]));

      const currentWallets = readWalletEntries();
      const walletSet = new Set(currentWallets.map((wallet) => wallet.address));
      const walletsToAdd = importedWallets.filter((address) => !walletSet.has(address));
      localStorage.setItem(
        PORTFOLIO_WALLETS_KEY,
        JSON.stringify([...currentWallets, ...walletsToAdd.map((address) => ({ address, accountType: "wallet" as const }))])
      );

      const validatorAddResults = validatorsToAdd.length > 0
        ? await Promise.allSettled(validatorsToAdd.map((address) => api.addValidator(address)))
        : [];
      const failedValidatorAdds = validatorAddResults.filter((item) => item.status === "rejected").length;

      persistKeyState(result.key, buildSnapshot(importedValidators, importedWallets), result.updatedAt || result.createdAt);
      notifyListsUpdated();
      setImportKey("");
      syncFromStorage();

      const skipped = (importedValidators.length - validatorsToAdd.length) + (importedWallets.length - walletsToAdd.length);
      toast.success(`Imported: +${validatorsToAdd.length} validators, +${walletsToAdd.length} wallets (${skipped} duplicates skipped)`);
      if (failedValidatorAdds > 0) {
        toast.warning(`${failedValidatorAdds} validator(s) failed backend sync`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to import key");
    } finally {
      setImporting(false);
    }
  };

  const copyKey = async () => {
    if (!activeAddressKey) return;
    try {
      await navigator.clipboard.writeText(activeAddressKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.success("Key copied");
    } catch {
      toast.error("Failed to copy key");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" title="Address Vault">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Address Vault</DialogTitle>
          <DialogDescription>
            Sync your validators and wallets across devices using a key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Stats */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{validators.length} validators</Badge>
            <Badge variant="secondary">{walletAddresses.length} wallets</Badge>
            {isDirty && (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500">
                <AlertCircle className="h-3 w-3" />
                Unsaved changes
              </Badge>
            )}
            {hasKey && !isDirty && (
              <Badge variant="outline" className="gap-1 border-green-500/40 text-green-500">
                <Check className="h-3 w-3" />
                Saved
              </Badge>
            )}
          </div>

          {/* Your Key */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Your key</p>
              <p className="text-xs text-muted-foreground">Save your list to sync across devices.</p>
            </div>

            {hasKey ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <code className="flex w-full rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono truncate pr-8">
                      {activeAddressKey}
                    </code>
                    <button
                      onClick={copyKey}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy key"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button size="sm" onClick={updateList} disabled={saving || !isDirty} className="shrink-0 gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Saving…" : "Update"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last saved:{" "}
                  {lastKeyTimestamp ? new Date(lastKeyTimestamp).toLocaleString() : "—"}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {totalItems === 0
                    ? "Add validators or wallets first."
                    : "Save your current list to generate a key."}
                </p>
                <Button size="sm" onClick={saveList} disabled={saving || totalItems === 0} className="shrink-0 gap-1.5">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </div>

          {/* Import */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Import from key</p>
              <p className="text-xs text-muted-foreground">Load validators and wallets saved on another device.</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Paste key…"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !importing) importList();
                }}
              />
              <Button
                variant="outline"
                onClick={importList}
                disabled={importing || !importKey.trim()}
                className="shrink-0 gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {importing ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
