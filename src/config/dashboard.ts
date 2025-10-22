// Dashboard configuration
// You can modify these values to customize the dashboard behavior

export const dashboardConfig = {
  // Show combined chart for all validators
  SHOW_COMBINED_CHART: true,
  
  // Use accordion to collapse/expand individual validator sections
  USE_ACCORDION: true,
  
  // Default state for accordion items (true = expanded, false = collapsed)
  DEFAULT_ACCORDION_EXPANDED: false,
  
  // Allow removing validators from the list
  ALLOW_REMOVE_VALIDATOR: false,
  
  // Show chart mode toggle (per validator vs summed)
  SHOW_CHART_MODE_TOGGLE: true,
  
  // Default chart mode ('per-validator' | 'summed')
  DEFAULT_CHART_MODE: 'per-validator' as 'per-validator' | 'summed',
  
  // Enable autocomplete for validator address input
  USE_AUTOCOMPLETE: true,
} as const;
