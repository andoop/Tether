declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }
  export function generate(
    text: string,
    options?: GenerateOptions,
    callback?: (qr: string) => void
  ): void;
  const _default: { generate: typeof generate };
  export default _default;
}
