import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Netflix-inspired dark theme preset
export const CinemaPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{red.50}',
      100: '{red.100}',
      200: '{red.200}',
      300: '{red.300}',
      400: '{red.400}',
      500: '#e50914',
      600: '#c50812',
      700: '#a5070f',
      800: '#85060c',
      900: '#650509',
      950: '#450308',
    },
    colorScheme: {
      dark: {
        primary: {
          color: '#e50914',
          inverseColor: '#ffffff',
          hoverColor: '#f40612',
          activeColor: '#c50812',
        },
        highlight: {
          background: 'rgba(229, 9, 20, 0.15)',
          focusBackground: 'rgba(229, 9, 20, 0.25)',
          color: '#ffffff',
          focusColor: '#ffffff',
        },
        surface: {
          0: '#ffffff',
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#141414',
        },
        formField: {
          background: '#27272a',
          disabledBackground: '#3f3f46',
          filledBackground: '#27272a',
          filledHoverBackground: '#27272a',
          filledFocusBackground: '#27272a',
          borderColor: '#3f3f46',
          hoverBorderColor: '#52525b',
          focusBorderColor: '#e50914',
          invalidBorderColor: '#ef4444',
          color: '#ffffff',
          disabledColor: '#71717a',
          placeholderColor: '#71717a',
          invalidPlaceholderColor: '#f87171',
          floatLabelColor: '#a1a1aa',
          floatLabelFocusColor: '#e50914',
          floatLabelActiveColor: '#a1a1aa',
          floatLabelInvalidColor: '#ef4444',
          iconColor: '#a1a1aa',
          shadow: '0 0 0 2px rgba(229, 9, 20, 0.2)',
        },
        content: {
          background: '#18181b',
          hoverBackground: '#27272a',
          borderColor: '#3f3f46',
          color: '#e5e5e5',
          hoverColor: '#ffffff',
        },
        overlay: {
          select: {
            background: '#18181b',
            borderColor: '#3f3f46',
            color: '#e5e5e5',
          },
          popover: {
            background: '#18181b',
            borderColor: '#27272a',
            color: '#e5e7eb',
          },
          modal: {
            background: '#18181b',
            borderColor: '#3f3f46',
            color: '#e5e5e5',
          },
        },
        list: {
          option: {
            focusBackground: '#27272a',
            selectedBackground: 'rgba(229, 9, 20, 0.15)',
            selectedFocusBackground: 'rgba(229, 9, 20, 0.25)',
            color: '#e5e5e5',
            focusColor: '#ffffff',
            selectedColor: '#ffffff',
            selectedFocusColor: '#ffffff',
            icon: {
              color: '#a1a1aa',
              focusColor: '#ffffff',
            },
          },
          optionGroup: {
            background: 'transparent',
            color: '#a1a1aa',
          },
        },
        navigation: {
          item: {
            focusBackground: '#27272a',
            activeBackground: 'rgba(229, 9, 20, 0.15)',
            color: '#e5e5e5',
            focusColor: '#ffffff',
            activeColor: '#ffffff',
            icon: {
              color: '#a1a1aa',
              focusColor: '#ffffff',
              activeColor: '#ffffff',
            },
          },
          submenuLabel: {
            background: 'transparent',
            color: '#a1a1aa',
          },
          submenuIcon: {
            color: '#a1a1aa',
            focusColor: '#ffffff',
            activeColor: '#ffffff',
          },
        },
      },
    },
  },
  components: {
    button: {
      colorScheme: {
        dark: {
          root: {
            primary: {
              background: '#e50914',
              hoverBackground: '#f40612',
              activeBackground: '#c50812',
              borderColor: '#e50914',
              hoverBorderColor: '#f40612',
              activeBorderColor: '#c50812',
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff',
            },
            secondary: {
              background: 'rgba(109, 109, 110, 0.7)',
              hoverBackground: 'rgba(109, 109, 110, 0.4)',
              activeBackground: 'rgba(109, 109, 110, 0.5)',
              borderColor: 'transparent',
              hoverBorderColor: 'transparent',
              activeBorderColor: 'transparent',
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff',
            },
          },
        },
      },
    },
    inputtext: {
      root: {
        borderRadius: '0.75rem',
        paddingX: '1rem',
        paddingY: '0.75rem',
      },
    },
    select: {
      root: {
        borderRadius: '0.75rem',
      },
      overlay: {
        borderRadius: '0.75rem',
        shadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
      },
    },
    multiselect: {
      root: {
        borderRadius: '0.75rem',
      },
      overlay: {
        borderRadius: '0.75rem',
        shadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
      },
    },
    dialog: {
      root: {
        borderRadius: '1rem',
      },
      header: {
        padding: '1.25rem 1.5rem',
      },
      content: {
        padding: '1.5rem',
      },
      footer: {
        padding: '1rem 1.5rem',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#18181b',
            borderColor: '#3f3f46',
          },
          header: {
            background: '#18181b',
          },
          content: {
            background: '#18181b',
          },
          footer: {
            background: '#18181b',
          },
        },
      },
    },
    menu: {
      root: {
        borderRadius: '0.75rem',
        padding: '0.5rem',
      },
      item: {
        borderRadius: '0.5rem',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#18181b',
            borderColor: '#3f3f46',
          },
        },
      },
    },
    toast: {
      colorScheme: {
        dark: {
          root: {
            background: '#1a1a1a',
            borderColor: 'rgba(255, 255, 255, 0.1)',
          },
        },
      },
    },
    drawer: {
      header: {
        padding: '0'
      },
      content: {
        padding: '0',
      },
      footer: {
        padding: '0',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#141414',
          },
        },
      },
    },
    popover: {
      root: {
        borderRadius: '0.75rem',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#18181b',
            borderColor: '#27272a',
          },
        },
      },
    },
    tooltip: {
      root: {
        borderRadius: '0.5rem',
        paddingX: '0.75rem',
        paddingY: '0.5rem',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#27272a',
            color: '#ffffff',
          },
        },
      },
    },
    card: {
      root: {
        borderRadius: '1rem',
      },
      body: {
        padding: '0'
      }
    },
    tag: {
      colorScheme: {
        dark: {
          root: {
            primary: {
              background: '#e50914',
              color: '#ffffff',
            },
            secondary: {
              background: '#52525b',
              color: '#d4d4d8',
            },
            success: {
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#4ade80',
            },
            info: {
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
            },
            warn: {
              background: 'rgba(234, 179, 8, 0.2)',
              color: '#facc15',
            },
            danger: {
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
            },
            contrast: {
              background: '#3f3f46',
              color: '#a1a1aa',
            },
          },
        },
      },
    },
    progressbar: {
      colorScheme: {
        dark: {
          root: {
            background: '#3f3f46',
          },
          value: {
            background: '#22c55e',
          },
        },
      },
    },
    progressspinner: {
      colorScheme: {
        dark: {
          root: {
            'color.1': '#e50914',
            'color.2': '#e50914',
            'color.3': '#e50914',
            'color.4': '#e50914',
          },
        },
      },
    },
    badge: {
      colorScheme: {
        dark: {
          primary: {
            background: '#e50914',
            color: '#ffffff',
          },
          secondary: {
            background: '#52525b',
            color: '#d4d4d8',
          },
          success: {
            background: '#22c55e',
            color: '#ffffff',
          },
          info: {
            background: '#3b82f6',
            color: '#ffffff',
          },
          warn: {
            background: '#eab308',
            color: '#000000',
          },
          danger: {
            background: '#ef4444',
            color: '#ffffff',
          },
        },
      },
    },
    message: {
      root: {
        borderRadius: '0.75rem',
      },
      colorScheme: {
        dark: {
          root: {
            background: '#27272a',
            borderColor: '#3f3f46',
          },
          error: {
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: '#f87171',
          },
          success: {
            background: 'rgba(34, 197, 94, 0.1)',
            borderColor: 'rgba(34, 197, 94, 0.3)',
            color: '#4ade80',
          },
          warn: {
            background: 'rgba(234, 179, 8, 0.1)',
            borderColor: 'rgba(234, 179, 8, 0.3)',
            color: '#facc15',
          },
          info: {
            background: 'rgba(59, 130, 246, 0.1)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            color: '#60a5fa',
          },
        },
      },
    },
    skeleton: {
      colorScheme: {
        dark: {
          root: {
            background: 'rgba(255, 255, 255, 0.1)',
          },
        },
      },
    },
    chip: {
      colorScheme: {
        dark: {
          root: {
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
          },
        },
      },
    },
    slider: {
      colorScheme: {
        dark: {
          handle: {
            background: '#e50914',
          },
          range: {
            background: '#e50914',
          },
        },
      },
    },
    checkbox: {
      colorScheme: {
        dark: {
          root: {
            background: '#27272a',
            checkedBackground: '#e50914',
            checkedHoverBackground: '#f40612',
            borderColor: '#52525b',
            hoverBorderColor: '#e50914',
            checkedBorderColor: '#e50914',
            checkedHoverBorderColor: '#f40612',
          },
        },
      },
    },
  },
})
