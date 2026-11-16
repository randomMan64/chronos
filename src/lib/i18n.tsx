"use client";

import * as React from "react";

export type SupportedLocale = "en" | "es" | "de" | "fr" | "ja";

export const translations = {
  en: {
    nav: {
      organization: "ORGANIZATION",
      workspace: "WORKSPACE",
      modules: "MODULES",
      overview: "Overview",
      databaseExplorer: "Database Explorer",
      sqlGateway: "SQL Gateway",
      timeTravel: "Time Travel",
      transactionInspector: "Transaction Inspector",
      queryAnalyzer: "Query Analyzer",
      auditCenter: "Audit Center",
      backupRecovery: "Backup & Recovery",
      settingsIam: "Settings & IAM",
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      signOut: "Sign Out",
      myProfile: "My Profile",
      accountSettings: "Account Settings",
      security: "Security",
      appearance: "Appearance",
      manageProfileDesc: "Manage your personal profile and account settings",
    },
    account: {
      account: "Account",
      accountDesc:
        "Manage your personal profile, credentials, and individual system preferences",
      myProfile: "My Profile",
      accountSettings: "Account Settings",
      security: "Security",
      appearance: "Appearance",
      signOut: "Sign Out",
      signOutConfirm: "Are you sure you want to end your current session?",
      cancel: "Cancel",
    },
    settings: {
      title: "Localization & Display Preferences",
      description: "Configure your preffered preferences",
      displayName: "Display Name",
      displayNamePlaceholder: "System Administrator",
      displayNameHelp: "Custom name shown in comments and logs",
      timezone: "Timezone",
      timezoneHelp:
        "Temporal audit trails and timeline queries will be rendered using this timezone.",
      dateFormat: "Date Format",
      timeFormat: "Time Format",
      twelveHour: "12-Hour (e.g. 02:30 PM)",
      twentyFourHour: "24-Hour (e.g. 14:30)",
      language: "Language Preferences",
      previewTitle: "LIVE TIMESTAMP PREVIEW",
      previewHelp:
        "Temporal audit logs, transactions, query history, and system backups will be rendered in this format across the studio.",
      savePreferences: "Save Preferences",
      saving: "Saving...",
      saved: "Saved!",
      saveSuccess: "Preferences saved successfully.",
    },
    appearance: {
      themeTitle: "Theme & Interface Appearance",
      themeDesc:
        "Select your preferred color scheme for the studio and editor environments",
      system: "System Preference",
      systemDesc: "Synchronize with your operating system",
      dark: "Dark Mode",
      darkDesc: "High contrast dark palette",
      light: "Light Mode",
      lightDesc: "Crisp minimal light palette",
      sidebarTitle: "Sidebar & Navigation",
      sidebarDesc: "Configure default drawer behavior and sidebar layout",
      defaultSidebarState: "Default Sidebar State",
      expanded: "Expanded (Full Navigation Labels)",
      collapsed: "Collapsed (Compact Icons Only)",
      mobileDrawerNote:
        "On mobile and small tablets, the sidebar automatically transitions to an overlay drawer.",
      monacoTitle: "SQL Editor & Monaco Defaults",
      monacoDesc:
        "Customize typography and convenience toggles in the query editor",
      fontSize: "Editor Font Size",
      wordWrap: "Word Wrap",
      wordWrapDesc: "Wrap long SQL query lines instead of horizontal scrolling",
      lineNumbers: "Line Numbers",
      lineNumbersDesc: "Show line numbering gutter in SQL editor",
      minimap: "Editor Minimap",
      minimapDesc: "Display high-level code minimap overview on right gutter",
      saveAppearance: "Save Appearance Preferences",
      saving: "Saving...",
      saved: "Saved!",
      appearanceSaved: "Appearance preferences saved successfully.",
    },
  },
  es: {
    nav: {
      organization: "ORGANIZACIÓN",
      workspace: "ESPACIO DE TRABAJO",
      modules: "MÓDULOS",
      overview: "Visión General",
      databaseExplorer: "Explorador de Base de Datos",
      sqlGateway: "Puerta de Enlace SQL",
      timeTravel: "Viaje en el Tiempo",
      transactionInspector: "Inspector de Transacciones",
      queryAnalyzer: "Analizador de Consultas",
      auditCenter: "Centro de Auditoría",
      backupRecovery: "Copias de Seguridad y Recuperación",
      settingsIam: "Configuración e IAM",
      collapseSidebar: "Contraer barra lateral",
      expandSidebar: "Expandir barra lateral",
      signOut: "Cerrar Sesión",
      myProfile: "Mi Perfil",
      accountSettings: "Configuración de Cuenta",
      security: "Seguridad",
      appearance: "Apariencia",
      manageProfileDesc:
        "Administre su perfil personal y configuración de cuenta",
    },
    account: {
      account: "Cuenta",
      accountDesc:
        "Administre su perfil personal, credenciales y preferencias individuales del sistema",
      myProfile: "Mi Perfil",
      accountSettings: "Configuración de Cuenta",
      security: "Seguridad",
      appearance: "Apariencia",
      signOut: "Cerrar Sesión",
      signOutConfirm: "¿Está seguro de que desea finalizar su sesión actual?",
      cancel: "Cancelar",
    },
    settings: {
      title: "Preferencias de Localización y Visualización",
      description:
        "Configure sus formatos regionales preferidos, marcas de tiempo e idioma de interfaz",
      displayName: "Nombre para Mostrar",
      displayNamePlaceholder: "Administrador del Sistema",
      displayNameHelp:
        "Nombre personalizado que se muestra en comentarios y registros",
      timezone: "Zona Horaria",
      timezoneHelp:
        "Las pistas de auditoría temporal y las consultas de línea de tiempo se mostrarán utilizando esta zona horaria.",
      dateFormat: "Formato de Fecha",
      timeFormat: "Formato de Hora",
      twelveHour: "12 Horas (ej. 02:30 PM)",
      twentyFourHour: "24 Horas (ej. 14:30)",
      language: "Preferencias de Idioma",
      previewTitle: "VISTA PREVIA DE MARCA DE TIEMPO EN VIVO",
      previewHelp:
        "Los registros de auditoría temporal, transacciones, historial de consultas y copias de seguridad se mostrarán en este formato en todo el estudio.",
      savePreferences: "Guardar Preferencias",
      saving: "Guardando...",
      saved: "¡Guardado!",
      saveSuccess: "Preferencias guardadas correctamente.",
    },
    appearance: {
      themeTitle: "Tema y Apariencia de la Interfaz",
      themeDesc:
        "Seleccione su combinación de colores preferida para el estudio y el editor",
      system: "Preferencia del Sistema",
      systemDesc: "Sincronizar con el sistema operativo",
      dark: "Modo Oscuro",
      darkDesc: "Paleta oscura de alto contraste",
      light: "Modo Claro",
      lightDesc: "Paleta clara minimalista y nítida",
      sidebarTitle: "Barra Lateral y Navegación",
      sidebarDesc:
        "Configure el comportamiento predeterminado del cajón y el diseño de la barra lateral",
      defaultSidebarState: "Estado Predeterminado de la Barra Lateral",
      expanded: "Expandido (Etiquetas completas)",
      collapsed: "Contraído (Solo iconos compactos)",
      mobileDrawerNote:
        "En móviles y tabletas pequeñas, la barra lateral cambia automáticamente a un cajón superpuesto.",
      monacoTitle: "Valores Predeterminados de SQL Editor y Monaco",
      monacoDesc:
        "Personalice la tipografía y los selectores de conveniencia en el editor de consultas",
      fontSize: "Tamaño de Fuente del Editor",
      wordWrap: "Ajuste de Línea",
      wordWrapDesc:
        "Ajustar líneas largas de consultas SQL en lugar de desplazamiento horizontal",
      lineNumbers: "Números de Línea",
      lineNumbersDesc: "Mostrar números de línea en el editor SQL",
      minimap: "Minimapa del Editor",
      minimapDesc:
        "Mostrar vista previa general del código en el margen derecho",
      saveAppearance: "Guardar Preferencias de Apariencia",
      saving: "Guardando...",
      saved: "¡Guardado!",
      appearanceSaved: "Preferencias de apariencia guardadas correctamente.",
    },
  },
  de: {
    nav: {
      organization: "ORGANISATION",
      workspace: "ARBEITSBEREICH",
      modules: "MODULE",
      overview: "Übersicht",
      databaseExplorer: "Datenbank-Explorer",
      sqlGateway: "SQL-Gateway",
      timeTravel: "Zeitreise",
      transactionInspector: "Transaktions-Inspektor",
      queryAnalyzer: "Abfrage-Analysator",
      auditCenter: "Audit-Zentrum",
      backupRecovery: "Sicherung & Wiederherstellung",
      settingsIam: "Einstellungen & IAM",
      collapseSidebar: "Seitenleiste einklappen",
      expandSidebar: "Seitenleiste ausklappen",
      signOut: "Abmelden",
      myProfile: "Mein Profil",
      accountSettings: "Kontoeinstellungen",
      security: "Sicherheit",
      appearance: "Erscheinungsbild",
      manageProfileDesc: "Verwalten Sie Ihr Profil und die Kontoeinstellungen",
    },
    account: {
      account: "Konto",
      accountDesc:
        "Verwalten Sie Ihr persönliches Profil, Zugangsdaten und individuelle Systemeinstellungen",
      myProfile: "Mein Profil",
      accountSettings: "Kontoeinstellungen",
      security: "Sicherheit",
      appearance: "Erscheinungsbild",
      signOut: "Abmelden",
      signOutConfirm: "Möchten Sie Ihre aktuelle Sitzung wirklich beenden?",
      cancel: "Abbrechen",
    },
    settings: {
      title: "Lokalisierungs- & Anzeigeeinstellungen",
      description:
        "Konfigurieren Sie Ihre bevorzugten regionalen Formate, Zeitstempel und Sprache",
      displayName: "Anzeigename",
      displayNamePlaceholder: "Systemadministrator",
      displayNameHelp: "Benutzerdefinierter Name für Kommentare und Protokolle",
      timezone: "Zeitzone",
      timezoneHelp:
        "Temporale Prüfpfade und Zeitachsenabfragen werden in dieser Zeitzone dargestellt.",
      dateFormat: "Datumsformat",
      timeFormat: "Zeitformat",
      twelveHour: "12 Stunden (z.B. 02:30 PM)",
      twentyFourHour: "24 Stunden (z.B. 14:30)",
      language: "Spracheinstellungen",
      previewTitle: "LIVE-ZEITSTEMPEL-VORSCHAU",
      previewHelp:
        "Temporale Überwachungsprotokolle, Transaktionen, Abfrageverlauf und Systemsicherungen werden im gesamten Studio in diesem Format dargestellt.",
      savePreferences: "Einstellungen speichern",
      saving: "Speichern...",
      saved: "Gespeichert!",
      saveSuccess: "Einstellungen erfolgreich gespeichert.",
    },
    appearance: {
      themeTitle: "Theme & Benutzeroberfläche",
      themeDesc: "Wählen Sie Ihr bevorzugtes Farbschema für Studio und Editor",
      system: "Systemeinstellung",
      systemDesc: "Mit dem Betriebssystem synchronisieren",
      dark: "Dunkelmodus",
      darkDesc: "Kontrastreiche dunkle Palette",
      light: "Hellmodus",
      lightDesc: "Klare, minimalistische helle Palette",
      sidebarTitle: "Seitenleiste & Navigation",
      sidebarDesc:
        "Standardverhalten und Layout der Seitenleiste konfigurieren",
      defaultSidebarState: "Standardstatus der Seitenleiste",
      expanded: "Ausgeklappt (Vollständige Beschriftungen)",
      collapsed: "Eingeklappt (Nur kompakte Symbole)",
      mobileDrawerNote:
        "Auf Mobilgeräten und kleinen Tablets wechselt die Seitenleiste automatisch.",
      monacoTitle: "SQL-Editor & Monaco-Standardwerte",
      monacoDesc: "Typografie und Umschalter im Abfrage-Editor anpassen",
      fontSize: "Editor-Schriftgröße",
      wordWrap: "Zeilenumbruch",
      wordWrapDesc: "Lange SQL-Zeilen umbrechen statt horizontal scrollen",
      lineNumbers: "Zeilennummern",
      lineNumbersDesc: "Zeilennummerierung im SQL-Editor anzeigen",
      minimap: "Editor-Minimap",
      minimapDesc: "Code-Übersicht im rechten Rand anzeigen",
      saveAppearance: "Darstellungseinstellungen speichern",
      saving: "Speichern...",
      saved: "Gespeichert!",
      appearanceSaved: "Darstellungseinstellungen erfolgreich gespeichert.",
    },
  },
  fr: {
    nav: {
      organization: "ORGANISATION",
      workspace: "ESPACE DE TRAVAIL",
      modules: "MODULES",
      overview: "Aperçu",
      databaseExplorer: "Explorateur de Bases de Données",
      sqlGateway: "Passerelle SQL",
      timeTravel: "Voyage Temporel",
      transactionInspector: "Inspecteur de Transactions",
      queryAnalyzer: "Analyseur de Requêtes",
      auditCenter: "Centre d'Audit",
      backupRecovery: "Sauvegarde & Récupération",
      settingsIam: "Paramètres & IAM",
      collapseSidebar: "Réduire la barre latérale",
      expandSidebar: "Développer la barre latérale",
      signOut: "Déconnexion",
      myProfile: "Mon Profil",
      accountSettings: "Paramètres du Compte",
      security: "Sécurité",
      appearance: "Apparence",
      manageProfileDesc:
        "Gérez votre profil personnel et vos paramètres de compte",
    },
    account: {
      account: "Compte",
      accountDesc:
        "Gérez votre profil personnel, vos identifiants et vos préférences système",
      myProfile: "Mon Profil",
      accountSettings: "Paramètres du Compte",
      security: "Sécurité",
      appearance: "Apparence",
      signOut: "Déconnexion",
      signOutConfirm:
        "Êtes-vous sûr de vouloir mettre fin à votre session actuelle ?",
      cancel: "Annuler",
    },
    settings: {
      title: "Préférences de Localisation et d'Affichage",
      description:
        "Configurez vos formats régionaux, horodatages et langue d'interface",
      displayName: "Nom Affiché",
      displayNamePlaceholder: "Administrateur Système",
      displayNameHelp:
        "Nom personnalisé affiché dans les commentaires et journaux",
      timezone: "Fuseau Horaire",
      timezoneHelp:
        "Les pistes d'audit temporel et les requêtes chronologiques seront affichées dans ce fuseau horaire.",
      dateFormat: "Format de Date",
      timeFormat: "Format de l'Heure",
      twelveHour: "12 Heures (ex. 02:30 PM)",
      twentyFourHour: "24 Heures (ex. 14:30)",
      language: "Préférences de Langue",
      previewTitle: "APERÇU DE L'HORODATAGE EN DIRECT",
      previewHelp:
        "Les journaux d'audit temporel, transactions, historique des requêtes et sauvegardes seront affichés dans ce format.",
      savePreferences: "Enregistrer les Préférences",
      saving: "Enregistrement...",
      saved: "Enregistré !",
      saveSuccess: "Préférences enregistrées avec succès.",
    },
    appearance: {
      themeTitle: "Thème et Apparence de l'Interface",
      themeDesc:
        "Sélectionnez votre palette de couleurs préférée pour le studio et l'éditeur",
      system: "Préférence Système",
      systemDesc: "Synchroniser avec votre système d'exploitation",
      dark: "Mode Sombre",
      darkDesc: "Palette sombre à contraste élevé",
      light: "Mode Clair",
      lightDesc: "Palette claire minimaliste et nette",
      sidebarTitle: "Barre Latérale et Navigation",
      sidebarDesc:
        "Configurer le comportement par défaut et la disposition de la barre latérale",
      defaultSidebarState: "État par Défaut de la Barre Latérale",
      expanded: "Développé (Libellés complets)",
      collapsed: "Réduit (Icônes compactes uniquement)",
      mobileDrawerNote:
        "Sur mobile et tablettes, la barre latérale devient automatiquement un volet superposé.",
      monacoTitle: "Paramètres par Défaut de SQL Editor et Monaco",
      monacoDesc:
        "Personnalisez la typographie et les options dans l'éditeur de requêtes",
      fontSize: "Taille de Police de l'Éditeur",
      wordWrap: "Retour à la Ligne",
      wordWrapDesc:
        "Renvoyer les longues lignes SQL à la ligne au lieu du défilement horizontal",
      lineNumbers: "Numéros de Ligne",
      lineNumbersDesc: "Afficher les numéros de ligne dans l'éditeur SQL",
      minimap: "Minimap de l'Éditeur",
      minimapDesc:
        "Afficher une vue d'ensemble du code dans la gouttière droite",
      saveAppearance: "Enregistrer les Préférences d'Apparence",
      saving: "Enregistrement...",
      saved: "Enregistré !",
      appearanceSaved: "Préférences d'apparence enregistrées avec succès.",
    },
  },
  ja: {
    nav: {
      organization: "組織",
      workspace: "ワークスペース",
      modules: "モジュール",
      overview: "概要",
      databaseExplorer: "データベースエクスプローラー",
      sqlGateway: "SQLゲートウェイ",
      timeTravel: "タイムトラベル",
      transactionInspector: "トランザクションインスペクター",
      queryAnalyzer: "クエリアナライザー",
      auditCenter: "監査センター",
      backupRecovery: "バックアップと復元",
      settingsIam: "設定とIAM",
      collapseSidebar: "サイドバーを折りたたむ",
      expandSidebar: "サイドバーを展開する",
      signOut: "サインアウト",
      myProfile: "マイプロフィール",
      accountSettings: "アカウント設定",
      security: "セキュリティ",
      appearance: "外観",
      manageProfileDesc: "個人プロフィールとアカウント設定を管理します",
    },
    account: {
      account: "アカウント",
      accountDesc:
        "個人プロフィール、資格情報、個別のシステム環境設定を管理します",
      myProfile: "マイプロフィール",
      accountSettings: "アカウント設定",
      security: "セキュリティ",
      appearance: "外観",
      signOut: "サインアウト",
      signOutConfirm: "現在のセッションを終了してもよろしいですか？",
      cancel: "キャンセル",
    },
    settings: {
      title: "地域と表示の設定",
      description:
        "地域フォーマット、タイムスタンプ、インターフェース言語を設定します",
      displayName: "表示名",
      displayNamePlaceholder: "システム管理者",
      displayNameHelp: "コメントやログに表示されるカスタム名",
      timezone: "タイムゾーン",
      timezoneHelp:
        "時間監査証跡とタイムラインクエリはこのタイムゾーンで表示されます。",
      dateFormat: "日付形式",
      timeFormat: "時刻形式",
      twelveHour: "12時間 (例: 02:30 PM)",
      twentyFourHour: "24時間 (例: 14:30)",
      language: "言語設定",
      previewTitle: "ライブタイムスタンププレビュー",
      previewHelp:
        "時間監査ログ、トランザクション、クエリ履歴、システムバックアップはスタジオ全体でこの形式で表示されます。",
      savePreferences: "設定を保存",
      saving: "保存中...",
      saved: "保存完了！",
      saveSuccess: "設定が正常に保存されました。",
    },
    appearance: {
      themeTitle: "テーマとインターフェースの外観",
      themeDesc: "スタジオおよびエディター環境の好みの配色を選択してください",
      system: "システム設定",
      systemDesc: "オペレーティングシステムと同期",
      dark: "ダークモード",
      darkDesc: "ハイコントラストなダークパレット",
      light: "ライトモード",
      lightDesc: "鮮明でミニマルなライトパレット",
      sidebarTitle: "サイドバーとナビゲーション",
      sidebarDesc: "ドロワーの動作とサイドバーのレイアウトを設定します",
      defaultSidebarState: "デフォルトのサイドバー状態",
      expanded: "展開 (完全なラベル)",
      collapsed: "折りたたみ (コンパクトアイコンのみ)",
      mobileDrawerNote:
        "モバイルや小型タブレットでは、サイドバーは自動的にオーバーレイドロワーに切り替わります。",
      monacoTitle: "SQLエディターとMonacoのデフォルト",
      monacoDesc:
        "クエリエディターのタイポグラフィとトグルをカスタマイズします",
      fontSize: "エディターのフォントサイズ",
      wordWrap: "右端での折り返し",
      wordWrapDesc: "水平スクロールの代わりに長いSQLクエリ行を折り返します",
      lineNumbers: "行番号",
      lineNumbersDesc: "SQLエディターで行番号を表示します",
      minimap: "エディターミニマップ",
      minimapDesc: "右側にコードの概要ミニマップを表示します",
      saveAppearance: "外観設定を保存",
      saving: "保存中...",
      saved: "保存完了！",
      appearanceSaved: "外観設定が正常に保存されました。",
    },
  },
};

type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: `${Exclude<K, symbol>}${DeepKeyOf<T[K]> extends never ? "" : `.${DeepKeyOf<T[K]>}`}`;
    }[keyof T]
  : never;

export type TranslationKey = DeepKeyOf<(typeof translations)["en"]>;

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = React.createContext<I18nContextType | undefined>(undefined);

function getInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem("chronos_language") as SupportedLocale;
    if (saved && ["en", "es", "de", "fr", "ja"].includes(saved)) {
      return saved;
    }
  } catch {}
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<SupportedLocale>("en");

  React.useEffect(() => {
    const initial = getInitialLocale();
    setLocaleState(initial);
    if (typeof document !== "undefined") {
      document.documentElement.lang = initial;
    }

    // Listen for cross-component settings updates
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ language?: SupportedLocale }>;
      if (
        customEvent.detail?.language &&
        ["en", "es", "de", "fr", "ja"].includes(customEvent.detail.language)
      ) {
        const nextLang = customEvent.detail.language;
        setLocaleState(nextLang);
        try {
          localStorage.setItem("chronos_language", nextLang);
          document.documentElement.lang = nextLang;
        } catch {}
      }
    };

    window.addEventListener("chronos:settings-updated", handleSettingsUpdate);
    return () =>
      window.removeEventListener(
        "chronos:settings-updated",
        handleSettingsUpdate,
      );
  }, []);

  const setLocale = React.useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem("chronos_language", nextLocale);
      if (typeof document !== "undefined") {
        document.documentElement.lang = nextLocale;
      }
    } catch {}
  }, []);

  const t = React.useCallback(
    (path: string, fallback?: string): string => {
      const keys = path.split(".");

      // Try active locale first
      let current: any = translations[locale];
      for (const k of keys) {
        if (current && typeof current === "object" && k in current) {
          current = current[k];
        } else {
          current = undefined;
          break;
        }
      }
      if (typeof current === "string") return current;

      // Fallback to English
      let fallbackVal: any = translations.en;
      for (const k of keys) {
        if (
          fallbackVal &&
          typeof fallbackVal === "object" &&
          k in fallbackVal
        ) {
          fallbackVal = fallbackVal[k];
        } else {
          fallbackVal = undefined;
          break;
        }
      }
      if (typeof fallbackVal === "string") return fallbackVal;

      return fallback ?? path;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = React.useContext(I18nContext);
  if (!context) {
    // Graceful fallback outside provider
    return {
      locale: "en" as SupportedLocale,
      setLocale: () => {},
      t: (path: string, fallback?: string) => fallback ?? path,
    };
  }
  return context;
}
