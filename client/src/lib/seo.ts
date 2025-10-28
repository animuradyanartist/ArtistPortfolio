export function updateCanonicalUrl(path: string) {
  const baseUrl = 'https://animuradyanart.replit.app';
  const canonicalUrl = `${baseUrl}${path}`;
  
  let link = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
  
  if (link) {
    link.href = canonicalUrl;
  } else {
    link = document.createElement('link');
    link.rel = 'canonical';
    link.href = canonicalUrl;
    document.head.appendChild(link);
  }
}
