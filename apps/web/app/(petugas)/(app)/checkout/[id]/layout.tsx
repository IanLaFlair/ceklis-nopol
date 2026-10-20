// Shell /checkout/offline di-precache service worker; semua /checkout/* jatuh ke shell ini saat offline.
export function generateStaticParams() {
  return [{ id: "offline" }];
}

export const dynamicParams = true;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
