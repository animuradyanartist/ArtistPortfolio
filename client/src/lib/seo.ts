export const BASE_URL = 'https://anymoore.am';

export function updateCanonicalUrl(path: string) {
  const canonicalUrl = `${BASE_URL}${path}`;
  
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

export function injectJsonLd(id: string, data: object) {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function removeJsonLd(id: string) {
  const script = document.getElementById(id);
  if (script) script.remove();
}
