import { createFsFileStorage } from 'remix/file-storage/fs'

export const uploadStorage = createFsFileStorage('./tmp/uploads')
