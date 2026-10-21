export interface DiagramRoom {
  width: number
  height: number
  availableWidth: number
  availableHeight: number
}

/**
 * The scale shared by the diagrams of one slide: the largest, at most 1, at
 * which each of them fits its room. A room without width, such as a hidden
 * container, sets no bound; a room without height, when the rest of the slide
 * already fills it, bounds the width alone.
 */
export function sharedFitScale(rooms: DiagramRoom[]): number {
  let scale = 1
  for (const room of rooms) {
    if (room.width <= 0 || room.height <= 0 || room.availableWidth <= 0)
      continue
    scale = Math.min(scale, room.availableWidth / room.width)
    if (room.availableHeight > 0)
      scale = Math.min(scale, room.availableHeight / room.height)
  }
  return scale
}
