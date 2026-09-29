export function motionClass(name: string): string {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "";
  }
  return `motion-${name}`;
}
