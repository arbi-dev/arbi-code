import { ModelPicker } from "./ModelPicker";
import { ProModeSelector } from "./ProModeSelector";
import { ChatModeSelector } from "./ChatModeSelector";
import { HIDE_PRO_UPSELLS } from "@/arbi-config";

export function ChatInputControls() {
  return (
    <div className="flex items-center">
      <ChatModeSelector />
      <div className="w-1.5"></div>
      <ModelPicker />
      {!HIDE_PRO_UPSELLS && <ProModeSelector />}
    </div>
  );
}
