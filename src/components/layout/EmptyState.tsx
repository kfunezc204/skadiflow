import { Button } from "@/components/ui/button";

type Props = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="text-white/15 mb-3">{icon}</div>
      <p className="text-sm text-white/40 font-medium">{title}</p>
      {description && (
        <p className="text-xs text-white/20 mt-1">{description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="mt-4 h-7 text-xs border-[#2A2A2A] bg-transparent text-white/40 hover:text-white hover:bg-white/5"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
