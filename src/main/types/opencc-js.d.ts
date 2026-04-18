declare module 'opencc-js' {
  interface ConverterOptions {
    from: 'cn' | 'tw' | 'hk' | 'jp' | 't'
    to: 'cn' | 'tw' | 'hk' | 'jp' | 't'
  }
  
  export function Converter(options: ConverterOptions): (text: string) => string
}
