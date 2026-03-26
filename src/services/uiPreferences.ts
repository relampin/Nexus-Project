import { resolveNexusPath } from "../core/paths";
import { JsonFileStore } from "../core/storage";
import { NexusUiPreferences, NexusUiThemePreset, UiPanelMode, UiThemePresetId } from "../projects/types";

const THEME_PRESETS: NexusUiThemePreset[] = [
  {
    id: "nexus",
    label: "Nexus Original",
    description: "Mantem o visual atual do painel, com base escura e acentos frios.",
    colors: {
      bg: "#09090b",
      surface: "#18181b",
      surfaceHover: "#27272a",
      primary: "#8b5cf6",
      secondary: "#06b6d4",
      primaryGlow: "rgba(139, 92, 246, 0.3)",
      secondaryGlow: "rgba(6, 182, 212, 0.15)",
    },
  },
  {
    id: "ocean",
    label: "Oceano",
    description: "Puxa o fundo para azul profundo, com leitura leve e fria.",
    colors: {
      bg: "#07131c",
      surface: "#102330",
      surfaceHover: "#173447",
      primary: "#0ea5e9",
      secondary: "#22d3ee",
      primaryGlow: "rgba(14, 165, 233, 0.24)",
      secondaryGlow: "rgba(34, 211, 238, 0.14)",
    },
  },
  {
    id: "ember",
    label: "Brasa",
    description: "Tema mais quente, com fundo vinho e acentos energicos.",
    colors: {
      bg: "#140c10",
      surface: "#24141b",
      surfaceHover: "#34202a",
      primary: "#f97316",
      secondary: "#fb7185",
      primaryGlow: "rgba(249, 115, 22, 0.24)",
      secondaryGlow: "rgba(251, 113, 133, 0.16)",
    },
  },
  {
    id: "forest",
    label: "Floresta",
    description: "Fundo verde profundo, com contraste mais calmo para leitura longa.",
    colors: {
      bg: "#08120d",
      surface: "#13231b",
      surfaceHover: "#1c3328",
      primary: "#22c55e",
      secondary: "#14b8a6",
      primaryGlow: "rgba(34, 197, 94, 0.22)",
      secondaryGlow: "rgba(20, 184, 166, 0.14)",
    },
  },
  {
    id: "graphite",
    label: "Grafite",
    description: "Versao mais neutra, reduzindo saturacao e deixando o painel sobrio.",
    colors: {
      bg: "#111317",
      surface: "#1a1f27",
      surfaceHover: "#262c37",
      primary: "#94a3b8",
      secondary: "#38bdf8",
      primaryGlow: "rgba(148, 163, 184, 0.18)",
      secondaryGlow: "rgba(56, 189, 248, 0.14)",
    },
  },
];

const DEFAULT_PREFERENCES: NexusUiPreferences = {
  themePreset: "nexus",
  panelMode: "full",
  updatedAt: new Date(0).toISOString(),
};

interface UiPreferencesState {
  preferences: NexusUiPreferences;
}

export class NexusUiPreferencesService {
  private readonly store = new JsonFileStore<UiPreferencesState>(
    resolveNexusPath("data", "ui-preferences.json"),
    {
      preferences: {
        ...DEFAULT_PREFERENCES,
        updatedAt: new Date().toISOString(),
      },
    },
  );

  getPreferences(): NexusUiPreferences {
    const state = this.store.read();
    return this.normalizePreferences(state.preferences);
  }

  updatePreferences(input: {
    themePreset?: UiThemePresetId;
    panelMode?: UiPanelMode;
  }) {
    const current = this.getPreferences();
    const next = this.normalizePreferences({
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    });

    this.store.write({
      preferences: next,
    });

    return next;
  }

  listThemePresets() {
    return THEME_PRESETS;
  }

  getThemePreset(themePresetId?: UiThemePresetId) {
    return THEME_PRESETS.find((preset) => preset.id === themePresetId) ?? THEME_PRESETS[0];
  }

  private normalizePreferences(value?: Partial<NexusUiPreferences>): NexusUiPreferences {
    const themePreset = (value?.themePreset && THEME_PRESETS.some((preset) => preset.id === value.themePreset))
      ? value.themePreset
      : DEFAULT_PREFERENCES.themePreset;
    const panelMode = value?.panelMode === "simplified"
      ? "simplified"
      : DEFAULT_PREFERENCES.panelMode;

    return {
      themePreset,
      panelMode,
      updatedAt: value?.updatedAt ?? new Date().toISOString(),
    };
  }
}
