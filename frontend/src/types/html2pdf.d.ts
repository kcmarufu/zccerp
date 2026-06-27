declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: { scale?: number; useCORS?: boolean; logging?: boolean; [key: string]: any };
    jsPDF?: { unit?: string; format?: string; orientation?: string; [key: string]: any };
    pagebreak?: { mode?: string | string[]; before?: string[]; after?: string[]; avoid?: string[] };
  }

  interface Html2PdfChain {
    set(options: Html2PdfOptions): Html2PdfChain;
    from(element: HTMLElement | string): Html2PdfChain;
    save(): Promise<void>;
    output(type: string, options?: any): Promise<any>;
    toPdf(): Html2PdfChain;
    get(type: string): Promise<any>;
  }

  function html2pdf(): Html2PdfChain;
  export = html2pdf;
}
