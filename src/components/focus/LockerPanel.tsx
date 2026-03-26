import { useState, useEffect } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLockerStore } from "@/stores/lockerStore";

export default function LockerPanel() {
  const { blockedDomains, hasPermission, isLoaded, loadBlockedDomains, setBlockedDomains, checkPermission } =
    useLockerStore();
  const [domainsText, setDomainsText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      loadBlockedDomains();
      checkPermission();
    }
  }, [isLoaded, loadBlockedDomains, checkPermission]);

  // Sync textarea when store loads
  useEffect(() => {
    if (isLoaded) {
      setDomainsText(blockedDomains.join("\n"));
      setDirty(false);
    }
  }, [isLoaded]); // eslint-disable-line

  function handleChange(val: string) {
    setDomainsText(val);
    setDirty(true);
  }

  async function handleSave() {
    const domains = domainsText
      .split(/[\n,]/)
      .map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);
    await setBlockedDomains(domains);
    setDomainsText(domains.join("\n"));
    setDirty(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
        Focus Locker
      </span>

      {/* Permission warning */}
      {hasPermission === false && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
          <ShieldOff size={12} className="text-red-400 flex-shrink-0" />
          <p className="text-[11px] text-red-400">
            No write permission to hosts file. Run as administrator to enable Focus Locker.
          </p>
        </div>
      )}

      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1.5">
          Blocked Sites (one per line)
        </label>
        <textarea
          value={domainsText}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={"twitter.com\nreddit.com\nyoutube.com"}
          rows={8}
          className="w-full rounded-md border border-white/10 bg-[#111] px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
        />
      </div>

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!dirty}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40"
      >
        <ShieldCheck size={13} className="mr-1.5" />
        Save
      </Button>

      {blockedDomains.length > 0 && (
        <p className="text-[10px] text-white/25 text-center">
          {blockedDomains.length} site{blockedDomains.length !== 1 ? "s" : ""} will be blocked during focus
        </p>
      )}
    </div>
  );
}
