/**
 * VisitaMed Theme Service
 * Gerencia preferência e aplicação de tema (claro/escuro)
 */

export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'visitamed-theme';

const THEME_ASSETS: Record<
  AppTheme,
  {
    themeColor: string;
    manifestHref: string;
    links: Record<string, string>;
  }
> = {
  light: {
    themeColor: '#2563eb',
    manifestHref: '/manifest.webmanifest',
    links: {
      'app-favicon-svg': '/favicon.svg',
      'app-favicon-32': '/favicon-32x32.png',
      'app-favicon-16': '/favicon-16x16.png',
      'app-favicon-ico': '/favicon.ico',
      'app-apple-touch-icon-180': '/icons/apple-touch-icon.png',
      'app-apple-touch-icon-167': '/icons/apple-touch-icon-167.png',
      'app-apple-touch-icon-152': '/icons/apple-touch-icon-152.png',
    },
  },
  dark: {
    themeColor: '#0b1220',
    manifestHref: '/manifest-dark.webmanifest',
    links: {
      'app-favicon-svg': '/favicon-dark.svg',
      'app-favicon-32': '/favicon-dark-32x32.png',
      'app-favicon-16': '/favicon-dark-16x16.png',
      'app-favicon-ico': '/favicon-dark.ico',
      'app-apple-touch-icon-180': '/icons/apple-touch-icon-dark.png',
      'app-apple-touch-icon-167': '/icons/apple-touch-icon-167-dark.png',
      'app-apple-touch-icon-152': '/icons/apple-touch-icon-152-dark.png',
    },
  },
};

function getSystemTheme(): AppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): AppTheme | null {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

export function getResolvedTheme(): AppTheme {
  return getStoredTheme() ?? getSystemTheme();
}

function updateThemeAssets(theme: AppTheme): void {
  const assets = THEME_ASSETS[theme];

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  themeColorMeta?.setAttribute('content', assets.themeColor);

  const manifestLinks = document.querySelectorAll('link[rel="manifest"]');
  manifestLinks.forEach((link) => {
    (link as HTMLLinkElement).setAttribute('href', assets.manifestHref);
  });

  Object.entries(assets.links).forEach(([id, href]) => {
    const link = document.getElementById(id) as HTMLLinkElement | null;
    link?.setAttribute('href', href);
  });
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  updateThemeAssets(theme);
}

export function initializeTheme(): AppTheme {
  const theme = getResolvedTheme();
  applyTheme(theme);
  return theme;
}

export function toggleTheme(): AppTheme {
  const current = getResolvedTheme();
  const next: AppTheme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
  return next;
}
