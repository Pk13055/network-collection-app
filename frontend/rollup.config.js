import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import serve from 'rollup-plugin-serve';
import uglify from 'rollup-plugin-uglify';
import conditional from 'rollup-plugin-conditional';

const isDEBUG = process.env.DEBUG;

module.exports = {
  input: 'src/index.js',
  output: {
    file: 'dist/bundle.js',
    format: 'iife',
    name: 'app'
  },
  plugins: [
    svelte({
      emitCss: true
    }),
    resolve({
      browser: true,
      dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
    }),
    commonjs(),
    postcss({
      extract: true,
      minimize: isDEBUG,
      use: [
        ['sass', {
          includePaths: [
            './theme',
            './node_modules'
          ]
        }]
      ]
    }),
    ...isDEBUG ? [
      conditional(isDEBUG, () => [
        serve({
          openPage: '/about',
          verbose: true,
          contentBase: '.',
          host: '0.0.0.0',
          port: 5000
        })
      ])
    ] : [
        uglify()
      ]

  ],
  watch: {
    clearScreen: !isDEBUG
  }
};
