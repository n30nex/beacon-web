import type { SVGProps } from "react";

type NavIconName =
  | "home"
  | "packets"
  | "map"
  | "live"
  | "channels"
  | "nodes"
  | "observers"
  | "routes"
  | "netgraph"
  | "traces"
  | "analytics"
  | "system"
  | "data"
  | "tools"
  | "appearance"
  | "region"
  | "search"
  | "signal";

export function NavIcon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName; size?: number }) {
  const common: SVGProps<SVGSVGElement> = {
    ...props,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3.5 10 8.5-7 8.5 7" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-6h5v6" />
        </svg>
      );
    case "packets":
      return (
        <svg {...common}>
          <path d="M21 8 12 3 3 8l9 5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M3 5.5 8.7 3.5l6.6 2 5.7-2v15l-5.7 2-6.6-2-5.7 2v-15Z" />
          <path d="M8.7 3.5v15M15.3 5.5v15" />
        </svg>
      );
    case "live":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M4 12h3l1.8-4.5L12 16l2.4-6 1.6 2h4" />
        </svg>
      );
    case "channels":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3l-5 .9 1-4.2A8.4 8.4 0 1 1 21 11.5Z" />
        </svg>
      );
    case "nodes":
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="2.3" />
          <circle cx="18" cy="7" r="2.3" />
          <circle cx="12" cy="18" r="2.3" />
          <path d="M8 7h8M7.1 9l3.8 7M16.9 9l-3.8 7" />
        </svg>
      );
    case "observers":
      return (
        <svg {...common}>
          <path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      );
    case "routes":
      return (
        <svg {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M7 6h4a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8" />
        </svg>
      );
    case "netgraph":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="8" cy="18" r="2" />
          <circle cx="17" cy="17" r="2" />
          <path d="M7.8 6.2 16.2 6.8M6.6 8 7.4 16M9.6 17.8l5.8-.6M9.3 16.7l7.4-8.4M17.6 9l-.2 6" />
        </svg>
      );
    case "traces":
      return (
        <svg {...common}>
          <path d="M4 18c2.3-7.8 5.2-11.8 8.5-12 2.6-.1 4.4 1.7 7.5 1.7" />
          <path d="M4 18h16" />
          <path d="M7 14h.01M10 9h.01M14 6h.01M18 8h.01" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M7 15v-5M12 15V5M17 15V8" />
          <path d="M5 19V4" />
        </svg>
      );
    case "system":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <path d="M8 9h3M8 12h6" />
        </svg>
      );
    case "data":
      return (
        <svg {...common}>
          <path d="M12 3 4 7l8 4 8-4-8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 17 8 4 8-4" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="m14.5 5 4.5 4.5" />
          <path d="M15 4a4 4 0 0 0 5 5L9 20l-5-5Z" />
        </svg>
      );
    case "appearance":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8h1.2A4.8 4.8 0 0 0 22 10.1C22 6.2 17.6 3 12 3Z" />
          <circle cx="7.5" cy="10" r=".7" />
          <circle cx="10.5" cy="7.5" r=".7" />
          <circle cx="14" cy="7.5" r=".7" />
        </svg>
      );
    case "region":
      return (
        <svg {...common}>
          <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "signal":
      return (
        <svg {...common}>
          <path d="M4 12h2.5l2-5 3.5 10 2.5-7 1.5 2H20" />
        </svg>
      );
    default:
      return null;
  }
}
