import type {
  LicenseConfig,
  NavBarConfig,
  ProfileConfig,
  SiteConfig,
} from './types/config'
// import { LinkPreset } from './types/config'

export const siteConfig: SiteConfig = {
  title: "Validark's Blog",
  subtitle: 'dev things',
  lang: 'en',         // 'en', 'zh_CN', 'zh_TW', 'ja', 'ko'
  themeColor: {
    hue: 285,         // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
    fixed: true,     // Hide the theme color picker for visitors
  },
  banner: {
    enable: false,
    src: 'assets/images/demo-banner.png',   // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    position: 'center', // Equivalent to object-position, defaults center
    credit: {
      enable: true,         // Display the credit text of the banner image
      text: 'asdf',              // Credit text to be displayed
      url: 'asf'                // (Optional) URL link to the original artwork or artist's page
    }
  },
  favicon: [    // Leave this array empty to use the default favicon
    {
      src: '../../favicon/favicon-16x16.png',
      sizes: '16x16',
    },
    {
      src: '../../favicon/favicon-32x32.png',
      sizes: '32x32',
    },
    {
      src: '../../favicon/favicon-128x128.png',
      sizes: '128x128',
    },
    {
      src: '../../favicon/favicon-180x180.png',
      sizes: '180x180',
    },
    {
      src: '../../favicon/android-chrome-192x192.png',
      sizes: '192x192',
    },
    {
      src: '../../favicon/android-chrome-512x512.png',
      sizes: '512x512',
    }
  ]
}

export const navBarConfig: NavBarConfig = {
  links: [
    // LinkPreset.Home,
    // LinkPreset.Posts,
    // LinkPreset.About,
    // {
    //   name: 'GitHub',
    //   url: 'https://github.com/saicaca/fuwari',     // Internal links should not include the base path, as it is automatically added
    //   external: true,                               // Show an external link icon and will open in a new tab
    // },
  ],
}

export const profileConfig: ProfileConfig = {
  avatar: '/Validark.jpeg',  // Relative to the /src directory. Relative to the /public directory if it starts with '/'
  name: 'Niles Salter',
  username: 'Validark',
  bio: 'Gotta go fast!',
  links: [
    // {
    //   name: 'Twitter',
    //   icon: 'fa6-brands:twitter',       // Visit https://icones.js.org/ for icon codes
    //                                     // You will need to install the corresponding icon set if it's not already included
    //                                     // `pnpm add @iconify-json/<icon-set-name>`
    //   url: 'https://twitter.com',
    // },
    {
      name: 'Validark@pm.me',
      icon: 'material-symbols:contact-mail',
      url: 'mailto:Validark@pm.me',
    },
    // {
    //   name: 'GitHub',
    //   icon: 'fa6-brands:github',
    //   url: 'https://github.com/Validark',
    // },
  ],
}

export const licenseConfig: LicenseConfig = {
  enable: true,
  name: 'CC BY-NC-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
}
