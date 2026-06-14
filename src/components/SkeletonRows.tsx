import { TerminalSkeletonRows } from "./TerminalLoader";

interface SkeletonRowsProps {
  rows?: number;
}

export function SkeletonRows({ rows = 8 }: SkeletonRowsProps) {
  return <TerminalSkeletonRows rows={rows} />;
}
