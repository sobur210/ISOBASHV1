type IconProps = {
  className?: string;
};

function Icon({ className = "h-4 w-4", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m6 4 14 8-14 8Z" />
  </Icon>
);

export const MenuIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const BrainIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8 3 3 0 0 0 4-2.8v-2.2A3 3 0 0 0 15 8a3 3 0 0 0-3-3Z" />
    <path d="M12 5v14" />
  </Icon>
);

export const GlobeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </Icon>
);

export const LayersIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Icon>
);

export const InfinityIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M7 8a4 4 0 1 0 0 8c2.5 0 3.5-2 5-4 1.5-2 2.5-4 5-4a4 4 0 1 1 0 8c-2.5 0-3.5-2-5-4-1.5-2-2.5-4-5-4Z" />
  </Icon>
);

export const WalletIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M16 13h2" />
  </Icon>
);

export const TrendingUpIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Icon>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const QuoteIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M9 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v2a2 2 0 0 1-2 2H4" />
    <path d="M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v2a2 2 0 0 1-2 2h-1" />
  </Icon>
);
