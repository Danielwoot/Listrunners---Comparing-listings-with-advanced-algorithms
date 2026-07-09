---
name: Cyber-Brutalist Metropolis
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c7c9ab'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#919378'
  outline-variant: '#464832'
  surface-tint: '#c0d100'
  primary: '#ffffff'
  on-primary: '#2e3300'
  primary-container: '#dbee00'
  on-primary-container: '#616a00'
  inverse-primary: '#5b6400'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#ffffff'
  on-tertiary: '#5b005b'
  tertiary-container: '#ffd7f5'
  on-tertiary-container: '#b300b3'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbee00'
  primary-fixed-dim: '#c0d100'
  on-primary-fixed: '#1a1e00'
  on-primary-fixed-variant: '#444b00'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#ffd7f5'
  tertiary-fixed-dim: '#ffabf3'
  on-tertiary-fixed: '#380038'
  on-tertiary-fixed-variant: '#810081'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-xl:
    fontFamily: Anton
    fontSize: 72px
    fontWeight: '400'
    lineHeight: '1.0'
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Anton
    fontSize: 48px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Anton
    fontSize: 36px
    fontWeight: '400'
    lineHeight: '1.1'
  headline-md:
    fontFamily: Anton
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Archivo Narrow
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Archivo Narrow
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  data-lg:
    fontFamily: Space Mono
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  data-sm:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  label-caps:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: '1.0'
    letterSpacing: 0.2em
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 40px
  container-max: 1440px
---

## Brand & Style

The design system is anchored in a futuristic, gritty metropolis aesthetic, blending high-tech HUD elements with raw Brutalist geometry. It targets an audience seeking high-end, technologically-advanced real estate in a hyper-urban environment. The interface should feel like a terminal used by an urban architect or a high-stakes asset manager in a neon-drenched future.

The visual style is **Cyber-Brutalist**:
- **Raw and Unrefined:** Heavy use of solid blacks, sharp edges, and structural grids.
- **HUD-Inspired:** Functional elements like crosshairs, scanning lines, and hazard stripes communicate data density and precision.
- **High-Energy Contrast:** Blinding neon accents pierce through pitch-black voids to draw immediate focus to critical calls to action and pricing data.

## Colors

The palette is designed for maximum visual impact against a deep, light-absorbing base.

- **Primary (Neon Yellow):** Used for primary actions, critical status indicators, and main navigation highlights.
- **Secondary (Hyper-Cyan):** Used for interactive elements, hover states, and informational data visualizations.
- **Tertiary (Fluorescent Magenta):** Used sparingly for alerts, luxury tier designations, or decorative glow accents.
- **Neutrals:** Pitch Black (#000000) serves as the primary canvas, while Deep Charcoal (#0F0F0F) defines container areas and structural backgrounds.
- **Glows:** Use low-opacity radial gradients of the accent colors to simulate light bleed on dark surfaces.

## Typography

The typography system differentiates between editorial "impact" and technical "data."

- **Headlines:** Utilize **Anton** for a bold, condensed, and powerful presence. All headlines should be set in uppercase to reinforce the brutalist aesthetic.
- **Body:** **Archivo Narrow** provides high legibility in dense layouts while maintaining the condensed, efficient feel of the interface.
- **Data & Pricing:** **Space Mono** is used for all numeric values, technical specifications, and labels. It evokes a terminal/command-line feel, suggesting precision and "raw" data access.

## Layout & Spacing

The layout is governed by a strict 12-column grid with a visible underlying 4px pixel-grid. 

- **Grid Lines:** Faint grey (#1A1A1A) 1px lines should be visible in the background of the main canvas.
- **Margins & Gutters:** High-density layouts are preferred. Gutters are kept tight at 16px to maintain a compact, high-tech feel.
- **Hazard Accents:** Diagonal 45-degree hazard stripes (alternating black and neon yellow) should be used as dividers or border accents for high-priority sections.
- **Crosshairs:** Small "+" symbols should mark the corners of major container sections or the intersection of grid lines.

## Elevation & Depth

This design system eschews traditional soft shadows in favor of light-based depth and structural layering.

- **Tonal Layering:** Depth is achieved by placing #0F0F0F containers over the #000000 base. 
- **Neon Outlines:** Elevation is indicated by 1px solid borders. Higher priority elements use the primary neon yellow; secondary elements use a dimmed hyper-cyan or grey.
- **Inner Glows:** For active states, use a subtle inner box-shadow with the accent color to make the element appear "energized."
- **Scanlines:** A subtle horizontal scanning line animation (low opacity) can be applied to the top-most elevated layer (e.g., modals).

## Shapes

The shape language is strictly geometric and aggressive.

- **Sharp Corners:** All standard containers and buttons have a 0px radius.
- **Chamfered Cuts:** Specific UI elements (primary buttons, active tabs, card headers) should feature a 45-degree diagonal cut-out on one or more corners (typically top-left or bottom-right).
- **Geometric Accents:** Use 90-degree brackets `[` `]` to frame numerical data or active menu items.

## Components

- **Buttons:** Primary buttons are solid Neon Yellow with black text. They feature a chamfered corner and no roundedness. Secondary buttons are ghost-style with a 1px Neon Yellow border.
- **Inputs:** Input fields are #0F0F0F with a 1px bottom border. On focus, the border glows Hyper-Cyan and a small crosshair appears in the corner.
- **Cards:** Property cards use a #0F0F0F background with a thin grey border. Imagery should have a slight blue/cool-tone color grade. Pricing is displayed in Space Mono in the top-right corner.
- **Progress Bars & Gauges:** Use segmented bars (blocks of color) rather than smooth gradients to represent data like "Market Demand" or "Value Increase."
- **Status Chips:** Small, rectangular blocks with monospaced text. For example, a "NEW ASSET" chip would be black text on a Hyper-Cyan background.
- **Navigation:** Vertical sidebars are preferred, utilizing "active" indicators that look like scanning brackets.