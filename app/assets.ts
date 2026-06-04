import { createAssetServer } from 'remix/assets'

const rootDir = process.cwd()

export const assetServer = createAssetServer({
  basePath: '/assets',
  rootDir,
  fileMap: {
    'app/*path': 'app/*path',
    'node_modules/*path': 'node_modules/*path',
  },
  allow: ['app/assets/**', 'node_modules/**'],
  deny: ['app/**/*.server.*'],
  sourceMaps: process.env.NODE_ENV === 'development' ? 'external' : undefined,
  scripts: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
    // @huggingface/transformers is loaded from a CDN via the page's
    // importmap (see batch-upload-stickers-page.tsx). Marking it external
    // here keeps the asset server from trying to bundle the ~30 MB ONNX
    // Runtime web bundle — onnxruntime-web ships prebuilt ESM files that
    // the asset server's CommonJS detector mis-flags
    // (`COMMONJS_NOT_SUPPORTED` for `ort.webgpu.bundle.min.mjs`). Letting
    // the browser fetch the maintained CDN build sidesteps the problem
    // and matches the upstream demos' deployment pattern.
    external: ['@huggingface/transformers'],
  },
})
