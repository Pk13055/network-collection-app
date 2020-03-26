import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import {terser} from 'rollup-plugin-terser';


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
            minimize: !isDEBUG,
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
            // debug/dev options
            livereload(),
            serve({
                verbose: true,
                contentBase: '.',
                host: '0.0.0.0',
                port: 5000
            })
        ] : [
            // production options
            terser()
        ]
    ],

    watch: {
        clearScreen: !isDEBUG
    }
};
