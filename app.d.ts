/// <reference types="nativewind/types" />

declare module 'react-native-feather' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export type FeatherIconProps = SvgProps & {
    size?: number | string;
  };

  export const Activity: FC<FeatherIconProps>;
  export const AlertCircle: FC<FeatherIconProps>;
  export const AlertTriangle: FC<FeatherIconProps>;
  export const ArrowRight: FC<FeatherIconProps>;
  export const Award: FC<FeatherIconProps>;
  export const BarChart2: FC<FeatherIconProps>;
  export const Bell: FC<FeatherIconProps>;
  export const Book: FC<FeatherIconProps>;
  export const Briefcase: FC<FeatherIconProps>;
  export const Calendar: FC<FeatherIconProps>;
  export const Camera: FC<FeatherIconProps>;
  export const Check: FC<FeatherIconProps>;
  export const CheckCircle: FC<FeatherIconProps>;
  export const ChevronDown: FC<FeatherIconProps>;
  export const ChevronLeft: FC<FeatherIconProps>;
  export const ChevronRight: FC<FeatherIconProps>;
  export const Clock: FC<FeatherIconProps>;
  export const Clipboard: FC<FeatherIconProps>;
  export const Coffee: FC<FeatherIconProps>;
  export const Compass: FC<FeatherIconProps>;
  export const CreditCard: FC<FeatherIconProps>;
  export const Database: FC<FeatherIconProps>;
  export const DollarSign: FC<FeatherIconProps>;
  export const Download: FC<FeatherIconProps>;
  export const Edit: FC<FeatherIconProps>;
  export const Edit3: FC<FeatherIconProps>;
  export const FilePlus: FC<FeatherIconProps>;
  export const FileText: FC<FeatherIconProps>;
  export const Globe: FC<FeatherIconProps>;
  export const Info: FC<FeatherIconProps>;
  export const Language: FC<FeatherIconProps>;
  export const Lock: FC<FeatherIconProps>;
  export const LogOut: FC<FeatherIconProps>;
  export const Mail: FC<FeatherIconProps>;
  export const Map: FC<FeatherIconProps>;
  export const MapPin: FC<FeatherIconProps>;
  export const Menu: FC<FeatherIconProps>;
  export const MessageSquare: FC<FeatherIconProps>;
  export const Play: FC<FeatherIconProps>;
  export const Plus: FC<FeatherIconProps>;
  export const RefreshCw: FC<FeatherIconProps>;
  export const Save: FC<FeatherIconProps>;
  export const Settings: FC<FeatherIconProps>;
  export const Share2: FC<FeatherIconProps>;
  export const Shield: FC<FeatherIconProps>;
  export const Send: FC<FeatherIconProps>;
  export const Tool: FC<FeatherIconProps>;
  export const Trash: FC<FeatherIconProps>;
  export const Trash2: FC<FeatherIconProps>;
  export const Truck: FC<FeatherIconProps>;
  export const Upload: FC<FeatherIconProps>;
  export const User: FC<FeatherIconProps>;
  export const UserCheck: FC<FeatherIconProps>;
  export const X: FC<FeatherIconProps>;
  export const XCircle: FC<FeatherIconProps>;
}

declare module 'lucide-react-native' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export type LucideIconProps = SvgProps & {
    size?: number | string;
  };

  export const Check: FC<LucideIconProps>;
  export const Globe: FC<LucideIconProps>;
  export const MapPin: FC<LucideIconProps>;
  export const X: FC<LucideIconProps>;
}
