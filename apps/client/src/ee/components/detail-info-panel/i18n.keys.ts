/**
 * i18n keys for Detail Info Panel
 * Add these to your i18n translation files
 */

export const DETAIL_INFO_PANEL_I18N_KEYS = {
  // Panel header & toggle
  'detail_panel.show_details': 'Show details',
  'detail_panel.hide_details': 'Hide details',
  'detail_panel.collapse': 'Collapse',
  'detail_panel.expand': 'Expand',
  'detail_panel.close': 'Close',
  'detail_panel.collapse_panel': 'Collapse panel',
  'detail_panel.expand_panel': 'Expand panel',
  'detail_panel.close_panel': 'Close panel',

  // Owner badge
  'detail_panel.owner': 'Owner',
  'detail_panel.contributors': 'contributors',

  // People section
  'detail_panel.people': 'PEOPLE',
  'detail_panel.creator': 'Creator',
  'detail_panel.last_updated_by': 'Last updated by',
  'detail_panel.unknown': 'Unknown',

  // Stats section
  'detail_panel.stats': 'STATS',
  'detail_panel.views': 'Views',
  'detail_panel.edits': 'Edits',
  'detail_panel.created': 'Created',
  'detail_panel.last_updated': 'Last updated',

  // Display section
  'detail_panel.display': 'DISPLAY',
  'detail_panel.full_width': 'Full-width',
  'detail_panel.full_width_desc': 'Content spans full width when enabled',
  'detail_panel.toggle_full_width': 'Toggle full-width mode',

  // Protection section
  'detail_panel.protection': 'PROTECTION',
  'detail_panel.protect_page': 'Protect this page',
  'detail_panel.protect_page_desc': 'Only editors can modify this page',
  'detail_panel.toggle_protection': 'Toggle page protection',

  // Actions section
  'detail_panel.actions': 'ACTIONS',
  'detail_panel.move': 'Move',
  'detail_panel.history': 'History',
  'detail_panel.export': 'Export',
  'detail_panel.print': 'Print',

  // Move dialog
  'detail_panel.move_page': 'Move page',
  'detail_panel.select_destination': 'Select destination',
  'detail_panel.choose_space': 'Choose the space where you want to move this page',
  'detail_panel.target_space': 'Target space',
  'detail_panel.select_space': 'Select a space',
  'detail_panel.my_documents': 'My Documents',
  'detail_panel.team_projects': 'Team Projects',
  'detail_panel.archive': 'Archive',

  // Export dialog
  'detail_panel.export_page': 'Export page',
  'detail_panel.export_format': 'Format',
  'detail_panel.select_format': 'Select format',

  // Danger zone section
  'detail_panel.danger_zone': 'DANGER ZONE',
  'detail_panel.restore': 'Restore',
  'detail_panel.archive_action': 'Archive',
  'detail_panel.archive_desc': 'Move page to archive',
  'detail_panel.restore_desc': 'Restore page from archive',
  'detail_panel.trash_action': 'Trash',
  'detail_panel.trash_desc': 'Move page to trash',

  // Archive confirmation
  'detail_panel.archive_page': 'Archive page',
  'detail_panel.archive_warning': 'This page will be moved to archive. You can restore it later.',
  'detail_panel.page_title': 'Page title',
  'detail_panel.archive_confirm': 'I understand this action cannot be undone immediately',

  // Delete confirmation
  'detail_panel.delete_page': 'Delete page',
  'detail_panel.danger_zone_warning': 'This action is permanent and cannot be undone. The page will be permanently deleted after 30 days in trash.',
  'detail_panel.delete_confirm': 'I understand this will delete the page permanently',

  // Common buttons
  'detail_panel.cancel': 'Cancel',
  'detail_panel.confirm': 'Confirm',

  // Loading & errors
  'detail_panel.loading': 'Loading...',
  'detail_panel.error': 'Error loading page details',
  'detail_panel.retry': 'Try again',
};

/**
 * Example i18n configuration:
 *
 * en.json or en.yaml should include:
 * {
 *   "detail_panel": {
 *     "collapse": "Collapse",
 *     "expand": "Expand",
 *     "close": "Close",
 *     ...
 *   }
 * }
 *
 * Then use with:
 * const { t } = useTranslation();
 * t('detail_panel.collapse')
 */
