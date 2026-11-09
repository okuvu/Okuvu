import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'worksheet_spec.dart';

/// Where an unfinished worksheet lives while the client is away.
///
/// Why on the phone rather than on the server: the requirement is that closing
/// the app or losing the connection must not lose what was written. A draft
/// that needs the network would fail exactly when the network is the thing that
/// broke. It also keeps half-finished, unsubmitted writing off the server.
///
/// One key per (user, worksheet), so two accounts on one handset cannot read
/// each other's drafts and re-opening the same worksheet resumes rather than
/// forks. Nothing here is ever uploaded: only a finished worksheet is, and only
/// through the safety-checked write path.
class WorksheetDraftStore {
  WorksheetDraftStore({Future<SharedPreferences> Function()? preferences})
      : _preferences = preferences ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _preferences;

  /// `worksheet_draft_v1:<user>:<worksheet>`. The version is in the key so a
  /// future shape change can ignore old drafts instead of misreading them.
  static String keyFor(String userId, String worksheetId) =>
      'worksheet_draft_v1:$userId:$worksheetId';

  Future<WorksheetDraft?> load(String userId, String worksheetId) async {
    final prefs = await _preferences();
    final raw = prefs.getString(keyFor(userId, worksheetId));
    if (raw == null || raw.isEmpty) return null;
    try {
      return WorksheetDraft.fromJson(jsonDecode(raw));
    } on FormatException {
      // A draft that cannot be read is worthless, not fatal: drop it and let
      // the client start again rather than crashing on open.
      await prefs.remove(keyFor(userId, worksheetId));
      return null;
    }
  }

  Future<void> save(String userId, String worksheetId, WorksheetDraft draft) async {
    final prefs = await _preferences();
    await prefs.setString(keyFor(userId, worksheetId), jsonEncode(draft.toJson()));
  }

  /// Called once a worksheet is finished and handed over, so the next open is a
  /// fresh start rather than a resurrection.
  Future<void> clear(String userId, String worksheetId) async {
    final prefs = await _preferences();
    await prefs.remove(keyFor(userId, worksheetId));
  }
}
