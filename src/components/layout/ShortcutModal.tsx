import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
};

function KbdRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-white/60">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-white/70"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

export default function ShortcutModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1A1A1A] border-[#2A2A2A] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-2">
          <div>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">
              Global
            </p>
            <KbdRow keys={["Ctrl", "N"]} label="New task" />
            <KbdRow keys={["Ctrl", "Shift", "F"]} label="Focus Mode" />
            <KbdRow keys={["Ctrl", ","]} label="Settings" />
            <KbdRow keys={["?"]} label="This shortcuts modal" />
          </div>

          <div>
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">
              Focus Mode
            </p>
            <KbdRow keys={["Space"]} label="Pause / Resume" />
            <KbdRow keys={["S"]} label="Skip interval" />
            <KbdRow keys={["D"]} label="Mark task done" />
            <KbdRow keys={["Esc"]} label="Exit focus mode" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
