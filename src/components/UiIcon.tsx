import { cn } from "./ui";

type UiIconName =
  | "arrow-up-right"
  | "buildings"
  | "caret-down"
  | "chart"
  | "credit-card"
  | "gift"
  | "layers"
  | "menu"
  | "more"
  | "search"
  | "settings"
  | "shield"
  | "sliders"
  | "swap"
  | "tray"
  | "wallet";

const UI_ICON_CLASS = {
  "arrow-up-right": "ph--arrow-up-right-bold",
  buildings: "ph--buildings",
  "caret-down": "ph--caret-down-bold",
  chart: "ph--chart-line-up-bold",
  "credit-card": "ph--credit-card",
  gift: "ph--gift",
  layers: "ph--stack-bold",
  menu: "ph--list-bold",
  more: "ph--dots-three-bold",
  search: "ph--magnifying-glass",
  settings: "ph--gear",
  shield: "ph--shield-check",
  sliders: "ph--sliders-horizontal",
  swap: "ph--arrows-down-up",
  tray: "ph--tray",
  wallet: "ph--wallet-bold",
} satisfies Record<UiIconName, string>;

type UiIconProps = {
  className?: string;
  name: UiIconName;
};

export const UiIcon: React.FC<UiIconProps> = ({ className, name }) => {
  return (
    <span aria-hidden="true" className={cn("iconify shrink-0", UI_ICON_CLASS[name], className)} />
  );
};
