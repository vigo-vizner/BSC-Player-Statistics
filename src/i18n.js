// ── Translations ──────────────────────────────────────────────────────────────
// Add new keys here in both languages. Use snake_case keys.

const translations = {
  en: {
    // General
    app_name:             'BSC Bratislava',
    app_subtitle:         'Player Statistics',
    sign_in:              'Sign In',
    logout:               'Logout',
    save:                 'Save',
    cancel:               'Cancel',
    edit:                 'Edit',
    delete:               'Delete',
    actions:              'Actions',
    status:               'Status',
    open:                 'Open',
    closed:               'Closed',
    no_data:              'No data yet.',
    confirm_delete:       'Are you sure? This cannot be undone.',

    // Auth
    admin_password:       'Admin Password',
    invalid_password:     'Invalid password. Try again.',

    // Nav
    nav_dashboard:        'Dashboard',
    nav_admin:            'Admin',

    // Dashboard
    dashboard:            'Dashboard',
    no_seasons:           'No seasons yet. Go to Admin to create one.',
    live:                 'Live',
    view:                 'View',
    summary:              'Summary',
    season_summary:       'Season Summary',
    no_matches:           'No matches yet',

    // Admin
    admin:                'Admin',
    players:              'Players',
    add_player:           '+ Player',
    jersey:               '#',
    name:                 'Name',
    jersey_number:        'Jersey #',
    active:               'Active',
    inactive:             'Inactive',
    add_player_title:     'Add Player',
    edit_player_title:    'Edit Player',
    seasons_matches:      'Seasons & Matches',
    add_season:           '+ Season',
    add_season_title:     'Add Season',
    edit_season_title:    'Edit Season',
    season_name:          'Season Name',
    season_placeholder:   'e.g. 2025/26',
    add_match_title:      'Add Match',
    edit_match_title:     'Edit Match',
    add_match:            '+ Match',
    edit_season:          'Edit Season',
    delete_season:        'Delete Season',
    opponent:             'Opponent',
    date:                 'Date',
    location:             'Location',
    location_placeholder: 'Home / Away / Arena name',
    no_seasons_admin:     'No seasons yet.',
    no_matches_admin:     'No matches',
    confirm_delete_match: 'Delete this match and all its stats?',
    confirm_delete_season:'Delete this season and ALL its matches and stats?',
    confirm_close_match:  'Close this match? Stats will be locked.',
    reopen:               '🔓 Reopen',
    close_match:          '🔒 Close',

    // Live match
    vs:                   'vs',
    undo:                 '↩ Undo',
    no_stats_yet:         'No stats recorded yet',
    last:                 'Last',
    close_match_btn:      '🔒 Close Match',
    confirm_close:        'Close this match? Stats will be locked.',
    match_closed_banner:  '🔒 This match is closed — stats are locked.',
    reopen_in_admin:      'Reopen in Admin',
    player:               'Player',
    pts:                  'PTS',

    // Summary
    summary_title:        'Summary',
    back_to_match:        '← Back to Match',
    back_to_dashboard:    '← Dashboard',
    export_csv:           'Export CSV',
    matches_count_one:    'match',
    matches_count_other:  'matches',
    season_summary_title: 'Season Summary',

    // Stat labels
    stat_1pt:  '1PT',
    stat_2pt:  '2PT',
    stat_3pt:  '3PT',
    stat_oreb: 'OReb',
    stat_dreb: 'DReb',
    stat_ast:  'AST',
    stat_to:   'TO',
    stat_blk:  'BLK',
    stat_stl:  'STL',
    stat_pf:   'PF',
  },

  sk: {
    // General
    app_name:             'BSC Bratislava',
    app_subtitle:         'Štatistiky hráčov',
    sign_in:              'Prihlásiť sa',
    logout:               'Odhlásiť',
    save:                 'Uložiť',
    cancel:               'Zrušiť',
    edit:                 'Upraviť',
    delete:               'Vymazať',
    actions:              'Akcie',
    status:               'Stav',
    open:                 'Otvorený',
    closed:               'Uzavretý',
    no_data:              'Zatiaľ žiadne dáta.',
    confirm_delete:       'Naozaj? Tento krok nie je možné vrátiť.',

    // Auth
    admin_password:       'Adminské heslo',
    invalid_password:     'Nesprávne heslo. Skúste znova.',

    // Nav
    nav_dashboard:        'Prehľad',
    nav_admin:            'Admin',

    // Dashboard
    dashboard:            'Prehľad',
    no_seasons:           'Zatiaľ žiadne sezóny. Prejdite do Adminu a vytvorte ju.',
    live:                 'Live',
    view:                 'Zobraziť',
    summary:              'Súhrn',
    season_summary:       'Súhrn sezóny',
    no_matches:           'Zatiaľ žiadne zápasy',

    // Admin
    admin:                'Admin',
    players:              'Hráči',
    add_player:           '+ Hráč',
    jersey:               '#',
    name:                 'Meno',
    jersey_number:        'Číslo dresu',
    active:               'Aktívny',
    inactive:             'Neaktívny',
    add_player_title:     'Pridať hráča',
    edit_player_title:    'Upraviť hráča',
    seasons_matches:      'Sezóny a zápasy',
    add_season:           '+ Sezóna',
    add_season_title:     'Pridať sezónu',
    edit_season_title:    'Upraviť sezónu',
    season_name:          'Názov sezóny',
    season_placeholder:   'napr. 2025/26',
    add_match_title:      'Pridať zápas',
    edit_match_title:     'Upraviť zápas',
    add_match:            '+ Zápas',
    edit_season:          'Upraviť sezónu',
    delete_season:        'Vymazať sezónu',
    opponent:             'Súper',
    date:                 'Dátum',
    location:             'Miesto',
    location_placeholder: 'Domov / Vonku / Hala',
    no_seasons_admin:     'Zatiaľ žiadne sezóny.',
    no_matches_admin:     'Žiadne zápasy',
    confirm_delete_match: 'Vymazať tento zápas a všetky jeho štatistiky?',
    confirm_delete_season:'Vymazať túto sezónu a VŠETKY jej zápasy a štatistiky?',
    confirm_close_match:  'Uzavrieť zápas? Štatistiky budú uzamknuté.',
    confirm_close:        'Uzavrieť zápas? Štatistiky budú uzamknuté.',
    reopen:               '🔓 Otvoriť znova',
    close_match:          '🔒 Uzavrieť',

    // Live match
    vs:                   'vs',
    undo:                 '↩ Späť',
    no_stats_yet:         'Zatiaľ žiadne štatistiky',
    last:                 'Posledná',
    close_match_btn:      '🔒 Uzavrieť zápas',
    match_closed_banner:  '🔒 Zápas je uzavretý — štatistiky sú uzamknuté.',
    reopen_in_admin:      'Otvoriť v Admine',
    player:               'Hráč',
    pts:                  'Body',

    // Summary
    summary_title:        'Súhrn',
    back_to_match:        '← Späť na zápas',
    back_to_dashboard:    '← Prehľad',
    export_csv:           'Exportovať CSV',
    matches_count_one:    'zápas',
    matches_count_other:  'zápasov',
    season_summary_title: 'Súhrn sezóny',

    // Stat labels
    stat_1pt:  '1B',
    stat_2pt:  '2B',
    stat_3pt:  '3B',
    stat_oreb: 'ÚDos',
    stat_dreb: 'ODos',
    stat_ast:  'Asist',
    stat_to:   'Strata',
    stat_blk:  'Blok',
    stat_stl:  'Krád',
    stat_pf:   'Chyba',
  },
};

/**
 * Returns a translation function t(key) for the given language.
 * Falls back to English if key is missing in the target language.
 */
function getT(lang) {
  const dict = translations[lang] || translations.en;
  return (key) => dict[key] ?? translations.en[key] ?? key;
}

module.exports = { getT };
