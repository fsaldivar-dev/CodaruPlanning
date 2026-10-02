import AppKit
import Foundation

// SF Symbols are obtained from macOS, without shipping an icon font or fetching assets.
let names = ["sidebar.left", "rectangle.split.3x1", "square.stack.3d.up", "book.closed", "shippingbox", "point.3.connected.trianglepath.dotted", "gearshape", "plus", "xmark", "magnifyingglass", "chevron.right", "chevron.down", "arrow.left", "arrow.up.right", "checkmark", "checkmark.circle", "circle", "lightbulb", "bookmark", "checklist", "link", "doc.text", "doc.badge.plus", "pencil", "bold", "italic", "underline", "list.bullet", "list.number", "text.quote", "arrow.uturn.backward", "arrow.uturn.forward", "square.and.arrow.up", "square.and.arrow.down", "ellipsis", "tray", "exclamationmark.triangle", "arrow.triangle.2.circlepath", "line.3.horizontal.decrease", "square.on.square", "arrow.down", "paintpalette", "textformat", "sun.max", "moon", "desktopcomputer", "trash", "archivebox"]
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let output = root.appendingPathComponent("public/symbols")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for name in names {
    guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 22, weight: .regular)) else { fatalError("Missing system symbol: \(name)") }
    let image = NSImage(size: NSSize(width: 32, height: 32), flipped: false) { bounds in
        let ratio = min(25 / symbol.size.width, 25 / symbol.size.height)
        let size = NSSize(width: symbol.size.width * ratio, height: symbol.size.height * ratio)
        symbol.draw(in: NSRect(x: (32-size.width)/2, y: (32-size.height)/2, width: size.width, height: size.height))
        return true
    }
    guard let data = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot render \(name)") }
    try png.write(to: output.appendingPathComponent(name + ".png"))
}
let appIcon = NSImage(size: NSSize(width: 1024, height: 1024), flipped: false) { _ in
    NSColor(calibratedRed: 0.13, green: 0.4, blue: 0.89, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 60,y: 60,width: 904,height: 904), xRadius: 204,yRadius:204).fill()
    for (x, height) in [(240.0,410.0),(425.0,550.0),(610.0,315.0)] {
        NSColor.white.withAlphaComponent(0.94).setFill()
        NSBezierPath(roundedRect:NSRect(x:x,y:244,width:144,height:height),xRadius:29,yRadius:29).fill()
    }
    return true
}
let bitmap = NSBitmapImageRep(data: appIcon.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent("public/app-icon.png"))
print("Exported \(names.count) native symbols and the app icon.")
