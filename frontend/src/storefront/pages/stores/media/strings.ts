/**
 * Every seller-facing word of the Photos & video board, in one file.
 *
 * Two reasons it lives here rather than inline in the components:
 *   1. Sellers read these strings slowly, and some read them in a second
 *      language. Keeping them together is what makes a Hindi / Tamil /
 *      Malayalam pass a translation job rather than a rewrite.
 *   2. The board renders in two places (Add Product and the product row) and
 *      the wording must be identical in both, or it stops being one screen to
 *      learn.
 *
 * House style: short sentences, verbs the seller already uses, no computer
 * vocabulary ("cut or turn", not "crop / rotate"; "describe this photo", not
 * "alt text"). A control says exactly what happens when it is pressed.
 */
export const media = {
  section: 'Photos & video',

  /** Header counter, e.g. "3 / 8". */
  counter: (used: number, max: number) => `${used} / ${max}`,

  ready: {
    todo: 'Add 1 photo to put this product on your shop',
    done: (photos: number, hasVideo: boolean) =>
      `Ready — ${photos} photo${photos === 1 ? '' : 's'}${hasVideo ? ' and a video' : ''}`,
  },

  add: {
    camera: 'Take a photo',
    gallery: 'Choose from gallery',
    more: 'Add',
    hint: 'JPG or PNG. Big photos are made smaller for you.',
    full: (max: number) =>
      `You have all ${max} photos. Remove one to add another.`,
    left: (room: number) =>
      `Only ${room} more photo${room === 1 ? '' : 's'} will fit.`,
  },

  review: {
    title: 'Check your photos',
    step: (index: number, total: number) => `${index} of ${total}`,
    use: 'Use this photo',
    edit: 'Cut or turn it first',
    hint: 'Nothing is cut unless you choose to. The photo goes up exactly as you see it here.',
    useAll: (count: number) => `Use all ${count} photos as they are`,
    skip: 'Skip this photo',
  },

  editor: {
    title: 'Cut or turn',
    shapes: {
      full: 'Full',
      fullNote: 'as shot',
      square: 'Square',
      tall: 'Tall',
      wide: 'Wide',
    },
    turnLeft: 'Turn left',
    turnRight: 'Turn right',
    zoom: 'Zoom',
    reset: 'Start over',
    done: 'Done',
    cancel: 'Cancel',
    working: 'Working…',
  },

  grid: {
    tapHint: 'Tap any photo to change it',
    cover: 'Cover',
    coverExplainer:
      'Cover is the photo customers see first in your shop. Open a photo and choose “Make this the cover” to change it.',
    sending: 'Sending…',
    optimizing: 'Getting ready…',
    failed: 'Not sent',
    retry: 'Try again',
    discard: 'Remove',
  },

  sheet: {
    title: 'What do you want to do?',
    photoLabel: (index: number) => `Photo ${index}`,
    makeCover: 'Make this the cover',
    makeCoverNote: 'Customers see it first',
    isCover: 'This is the cover photo',
    isCoverNote: 'Customers see it first',
    edit: 'Cut or turn',
    editUnavailable: 'Already on your shop — use a different photo to change its shape',
    replace: 'Use a different photo',
    describe: 'Describe this photo',
    describeNote: 'Helps customers find it on Google',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    remove: 'Remove this photo',
    close: 'Close',
  },

  describe: {
    title: 'Describe this photo',
    help: 'Write what is in the photo. Customers who cannot see images, and Google, read this.',
    placeholder: 'Red cricket bat, front view',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
  },

  video: {
    label: 'Video',
    slot: (used: number) => `${used} / 1`,
    add: 'Add a video',
    optional: 'optional',
    hint: 'One short video. It plays in your shop next to the photos.',
    play: 'Play it',
    replace: 'Use a different video',
    remove: 'Remove the video',
    sending: 'Sending video…',
    full: 'You can add one video. Remove this one to add another.',
  },

  preview: {
    title: 'How your product will look',
    noPrice: 'Price set below',
  },

  confirm: {
    photoTitle: 'Remove this photo?',
    photoBody:
      'It will be taken off this product. If it was the cover, the next photo becomes the cover.',
    videoTitle: 'Remove the video?',
    videoBody: 'It will be taken off this product.',
    remove: 'Remove',
    keep: 'Keep it',
  },

  errors: {
    format: (name: string) =>
      `“${name}” is not a photo we can use. Send a JPG or PNG.`,
    unreadable: (name: string) =>
      `“${name}” could not be opened. Try a different photo.`,
    tooBig: (name: string) =>
      `“${name}” is too big even after shrinking. Try a photo taken at a smaller size.`,
    videoFormat: 'That video type does not work here. Send an MP4.',
    videoTooBig: (maxMB: number) =>
      `The video is too big. Keep it under ${maxMB} MB.`,
  },
} as const
