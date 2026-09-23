import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart' hide FontWeight;
import 'package:flutter/services.dart' show rootBundle, FontLoader;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Lightweight PDF rendering engine for the Pragnya Mitra school app.
///
/// The stock `pdf` package cannot shape complex scripts (Devanagari / Hindi),
/// so documents are rendered with Flutter's real text engine ([TextPainter])
/// onto A4 canvases at 2× resolution and embedded into the PDF as images.
/// Result: perfectly shaped Hindi (matras, conjuncts) on Android and Web.
class PdfEngine {
  PdfEngine._();

  static final PdfEngine instance = PdfEngine._();

  /// A4 dimensions (PostScript points).
  static const double pageWidthPt = 595.28;
  static const double pageHeightPt = 841.89;

  /// Render scale — pixels per point (2× → crisp at print resolution).
  static const double ratio = 2.0;

  /// Page margins in points.
  static const double marginPt = 34.0;
  static const double bottomPt = pageHeightPt - marginPt;

  static const ui.Color primary = ui.Color(0xFF0F766E);
  static const ui.Color ink = ui.Color(0xFF1F2937);
  static const ui.Color muted = ui.Color(0xFF6B7280);
  static const ui.Color hairline = ui.Color(0xFFD1D5DB);
  static const ui.Color headFill = ui.Color(0xFFF1F5F9);

  bool _fontsReady = false;
  bool _fontsLoaded = false;

  /// True when the Hind (Devanagari) fonts actually loaded into the engine.
  bool get fontsLoaded => _fontsLoaded;

  // Per-render state.
  ui.PictureRecorder? _recorder;
  ui.Canvas? _canvas;
  double _y = marginPt;
  bool _dirty = false;
  final List<ui.Image> _pages = [];

  /// Load the bundled Hind font (regular + bold) into the engine if needed.
  Future<void> ensureFonts() async {
    if (_fontsReady) return;
    try {
      await _loadFonts().timeout(const Duration(seconds: 10));
      _fontsLoaded = true;
    } catch (_) {
      // If fonts are unavailable (e.g. tests / slow web load) we still render —
      // Flutter falls back to a bundled system font for Latin text.
    }
    _fontsReady = true;
  }

  Future<void> _loadFonts() async {
    final reg = await rootBundle.load('assets/fonts/Hind-Regular.ttf');
    final bold = await rootBundle.load('assets/fonts/Hind-Bold.ttf');
    final loader = FontLoader('HindPdf');
    loader.addFont(Future.value(reg));
    await loader.load();
    final boldLoader = FontLoader('HindPdfBold');
    boldLoader.addFont(Future.value(bold));
    await boldLoader.load();
  }

  /// Render a flow of [blocks] into a multi-page A4 PDF.
  Future<Uint8List> renderPdf(List<PdfBlock> blocks) async {
    await ensureFonts();

    _pages.clear();
    _newPage(force: true);

    for (final block in blocks) {
      await _render(block);
    }

    if (_dirty) {
      await _closePage();
    }

    final doc = pw.Document();
    for (final page in _pages) {
      final data = await page.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) continue;
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          build: (context) => pw.Image(
            pw.MemoryImage(data.buffer.asUint8List()),
            fit: pw.BoxFit.fill,
          ),
        ),
      );
      page.dispose();
    }
    return doc.save();
  }

  Future<void> _render(PdfBlock block) async {
    if (block is PdfSpacer) {
      if (_y + block.pt > bottomPt) {
        await _breakPage();
      } else {
        _y += block.pt;
      }
      return;
    }

    if (block is PdfDivider) {
      final height = block.ptBefore + block.thickness + block.ptAfter;
      if (_y + height > bottomPt) {
        await _breakPage();
      }
      final cy = _y + block.ptBefore + block.thickness / 2;
      _canvas!.drawLine(
        ui.Offset(marginPt, cy),
        ui.Offset(pageWidthPt - marginPt, cy),
        ui.Paint()
          ..color = block.color
          ..strokeWidth = block.thickness,
      );
      _y += height;
      _dirty = true;
      return;
    }

    if (block is PdfText) {
      await _drawText(block);
      return;
    }

    if (block is PdfRow) {
      await _drawRow(block);
      return;
    }
  }

  // ── Text with pagination ──────────────────────────────────────────────────

  Future<void> _drawText(PdfText block) async {
    if (block.ptBefore > 0) {
      if (_y + block.ptBefore > bottomPt) {
        await _breakPage();
      } else {
        _y += block.ptBefore;
      }
    }

    final style = _style(block);
    const usable = pageWidthPt - 2 * marginPt;
    var text = block.text;

    TextPainter tp = _paint(text, style, block.align, usable);
    var totalHeight = tp.height;

    if (_y + totalHeight <= bottomPt) {
      tp.paint(_canvas!, ui.Offset(marginPt, _y));
      tp.dispose();
      _dirty = true;
      _y += totalHeight + block.ptAfter;
      return;
    }

    // Paragraph taller than the remaining space — split across pages.
    var guard = 0;
    while (text.isNotEmpty && _y + totalHeight > bottomPt && guard < 200) {
      guard++;
      final metrics = tp.computeLineMetrics();
      double h = 0;
      var linesFit = 0;
      for (final m in metrics) {
        if (_y + h + m.height <= bottomPt) {
          h += m.height;
          linesFit++;
        } else {
          break;
        }
      }
      if (linesFit == 0) {
        await _breakPage();
        tp.dispose();
        tp = _paint(text, style, block.align, usable);
        totalHeight = tp.height;
        continue;
      }

      final endOffset = tp.getPositionForOffset(ui.Offset(usable, h - 0.5)).offset;
      if (endOffset <= 0) break;
      final part = text.substring(0, endOffset);
      final rest = text.substring(endOffset);

      final partTp = _paint(part, style, block.align, usable);
      partTp.paint(_canvas!, ui.Offset(marginPt, _y));
      partTp.dispose();
      _dirty = true;

      text = rest.trimLeft();
      await _breakPage();
      tp.dispose();
      tp = _paint(text, style, block.align, usable);
      totalHeight = tp.height;
    }

    if (text.isNotEmpty && totalHeight <= bottomPt - _y) {
      tp.paint(_canvas!, ui.Offset(marginPt, _y));
      _dirty = true;
    }
    tp.dispose();
    _y += totalHeight + block.ptAfter;
  }

  // ── Table row with pagination ─────────────────────────────────────────────

  Future<void> _drawRow(PdfRow block) async {
    const usable = pageWidthPt - 2 * marginPt;
    const cellPad = 4.0;
    final startY = _y + block.ptBefore;

    if (startY > bottomPt) {
      await _breakPage();
    }
    _y = startY;

    // Lay out every cell to measure the row height.
    final recs = <_CellRec>[];
    double x = marginPt;
    for (var i = 0; i < block.cells.length; i++) {
      final cell = block.cells[i];
      final w = block.widths[i] * usable;
      final tp = TextPainter(
        text: TextSpan(text: cell, style: _style(PdfText('', size: block.bold ? 10.5 : 10, bold: block.bold))),
        textDirection: TextDirection.ltr,
        textAlign: i == 0 ? TextAlign.left : TextAlign.center,
      )..layout(maxWidth: w - cellPad * 2 - 2);
      recs.add(_CellRec(tp, x, w, tp.height + cellPad * 2));
      x += w;
    }

    final rowHeight = recs.isEmpty ? 20.0 : recs.map((r) => r.height).reduce((a, b) => a > b ? a : b);

    if (rowHeight > bottomPt - _y) {
      final fitsFresh = rowHeight <= bottomPt - marginPt;
      if (!fitsFresh) {
        // Row taller than a page — clip to the bottom edge.
        for (final r in recs) {
          r.tp.paint(_canvas!, ui.Offset(r.x + cellPad, _y + 1));
          r.tp.dispose();
        }
        _y += rowHeight;
        await _closePage();
        _newPage();
        return;
      }
      await _breakPage();
    }

    if (block.headerRow) {
      final fill = ui.Paint()..color = headFill;
      final line = ui.Paint()
        ..color = hairline
        ..strokeWidth = 0.6;
      var hx = marginPt;
      for (final r in recs) {
        _canvas!.drawRect(ui.Rect.fromLTWH(hx, _y, r.width, rowHeight), fill);
        _canvas!
          ..drawLine(ui.Offset(hx, _y), ui.Offset(hx, _y + rowHeight), line)
          ..drawLine(ui.Offset(hx + r.width, _y), ui.Offset(hx + r.width, _y + rowHeight), line);
        hx += r.width;
      }
      _canvas!.drawLine(ui.Offset(marginPt, _y), ui.Offset(marginPt + usable, _y), line);
    }

    for (final r in recs) {
      final textY = _y + (rowHeight - r.tp.height) / 2;
      r.tp.paint(_canvas!, ui.Offset(r.x + cellPad, textY + 1));
      r.tp.dispose();
    }

    if (!block.headerRow) {
      _canvas!.drawLine(
        ui.Offset(marginPt, _y + rowHeight),
        ui.Offset(marginPt + usable, _y + rowHeight),
        ui.Paint()
          ..color = hairline
          ..strokeWidth = 0.4,
      );
    }

    _y += rowHeight + block.ptAfter;
    _dirty = true;
  }

  // ── Page lifecycle ────────────────────────────────────────────────────────

  void _newPage({bool force = false}) {
    if (!force && _dirty) {
      return;
    }
    _recorder = ui.PictureRecorder();
    _canvas = ui.Canvas(_recorder!);
    _canvas!.scale(ratio);
    _y = marginPt;
    _dirty = false;
  }

  Future<void> _closePage() async {
    if (_recorder == null || !_dirty) return;
    final pic = _recorder!.endRecording();
    final img = await pic.toImage(
      (pageWidthPt * ratio).round(),
      (pageHeightPt * ratio).round(),
    );
    _pages.add(img);
    _recorder = null;
    _canvas = null;
    _dirty = false;
  }

  Future<void> _breakPage() async {
    await _closePage();
    _newPage(force: true);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  TextPainter _paint(String text, TextStyle style, PAlign align, double maxWidth) {
    return TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textAlign: _align(align),
    )..layout(maxWidth: maxWidth);
  }

  TextStyle _style(PdfText block) {
    return TextStyle(
      fontFamily: block.bold ? 'HindPdfBold' : 'HindPdf',
      fontSize: block.size,
      height: block.lineHeight,
      color: block.color,
    );
  }

  TextAlign _align(PAlign a) {
    switch (a) {
      case PAlign.center:
        return TextAlign.center;
      case PAlign.right:
        return TextAlign.right;
      case PAlign.justify:
        return TextAlign.justify;
      case PAlign.left:
        return TextAlign.left;
    }
  }
}

class _CellRec {
  final TextPainter tp;
  final double x;
  final double width;
  final double height;
  _CellRec(this.tp, this.x, this.width, this.height);
}

// ── Flow blocks ──────────────────────────────────────────────────────────────

enum PAlign { left, center, right, justify }

sealed class PdfBlock {
  const PdfBlock();
}

class PdfSpacer extends PdfBlock {
  final double pt;
  const PdfSpacer(this.pt);
}

class PdfDivider extends PdfBlock {
  final double ptBefore;
  final double ptAfter;
  final double thickness;
  final ui.Color color;
  const PdfDivider({
    this.ptBefore = 5,
    this.ptAfter = 5,
    this.thickness = 0.8,
    this.color = PdfEngine.hairline,
  });
}

class PdfText extends PdfBlock {
  final String text;
  final double size;
  final bool bold;
  final ui.Color color;
  final PAlign align;
  final double ptBefore;
  final double ptAfter;
  final double lineHeight;

  const PdfText(
    this.text, {
    this.size = 10.5,
    this.bold = false,
    this.color = PdfEngine.ink,
    this.align = PAlign.left,
    this.ptBefore = 0,
    this.ptAfter = 0,
    this.lineHeight = 1.45,
  });
}

/// A single table row. [widths] are fractions of the usable width and must sum
/// to ≤ 1.0.
class PdfRow extends PdfBlock {
  final List<String> cells;
  final List<double> widths;
  final bool bold;
  final bool headerRow;
  final double ptBefore;
  final double ptAfter;

  const PdfRow(
    this.cells, {
    required this.widths,
    this.bold = false,
    this.headerRow = false,
    this.ptBefore = 0,
    this.ptAfter = 0,
  });
}