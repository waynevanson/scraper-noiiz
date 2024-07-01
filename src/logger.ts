async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ESC = "\x1b"
const CSI = ESC + "["
const UP = CSI + "A"
const DELETE = CSI + "K"
