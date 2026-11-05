// Components may only use design tokens (SPEC §5). Raw colors, fonts, radii, shadows,
// border widths and spacing values are allowed only in the theme token file.
const TOKEN_ONLY = ['font-family', 'border-radius', 'box-shadow', 'border-width', 'outline-width'];

export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  allowEmptyInput: true,
  rules: {
    'selector-class-pattern': null,
    'no-descending-specificity': null,
    'property-no-vendor-prefix': null,
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
    'custom-property-pattern': null,
    'value-keyword-case': [
      'lower',
      { camelCaseSvgKeywords: true, ignoreProperties: ['/^--font/'] },
    ],
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
    ],
    'scale-unlimited/declaration-strict-value': [
      TOKEN_ONLY,
      {
        ignoreValues: ['0', 'none', 'inherit', 'unset', 'initial', 'currentColor', '50%'],
        disableFix: true,
      },
    ],
    'declaration-property-unit-disallowed-list': {
      '/^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)/': ['px', 'rem', 'em'],
      'font-size': ['px', 'rem', 'em'],
    },
  },
  overrides: [
    {
      files: ['web/src/themes/**/*.css'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null,
        'scale-unlimited/declaration-strict-value': null,
        'declaration-property-unit-disallowed-list': null,
        'color-hex-length': null,
      },
    },
  ],
};
