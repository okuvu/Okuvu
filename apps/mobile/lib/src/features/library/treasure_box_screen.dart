import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/providers.dart';
import '../../core/speech_service.dart';
import '../../theme/app_colors.dart';
import '../../widgets/okuvu_app_bar_title.dart';
import '../sharing/sharing.dart';
import 'treasure_providers.dart';

/// The approved copy, verbatim from the owner's document (9 Nov 2026).
const String treasureEmptyLine =
    'This is your space for things worth keeping: something you learnt, words '
    'that help, reminders for hard days. Add your first one whenever you\'re '
    'ready.';

const String treasurePrivacyLine =
    "Your therapist can't read this unless you choose to share it. If OKUVU's "
    "safety system notices you may be in danger, it will show you help straight "
    'away and let your therapist know you may need support, without sharing '
    'what you wrote.';

/// The Treasure Box.
///
/// The client's own place for things worth keeping — lessons, reminders, words
/// that help, steps that worked. Warm and personal on purpose: this is a
/// keepsake box, not a record. Nothing here is scored, counted or compared.
///
/// Two rules the screen keeps visible rather than buried:
///  - every note is Private until its own switch says otherwise, and the label
///    is on the note (owner's Step 6);
///  - every save goes through the same safety check as chat, so a note that
///    carries a disclosure raises the help card instead of disappearing into a
///    quiet corner of the app.
class TreasureBoxScreen extends ConsumerStatefulWidget {
  const TreasureBoxScreen({super.key});

  @override
  ConsumerState<TreasureBoxScreen> createState() => _TreasureBoxScreenState();
}

class _TreasureBoxScreenState extends ConsumerState<TreasureBoxScreen> {
  final _searchController = TextEditingController();
  TreasureQuery _query = const TreasureQuery();
  bool _searchOpen = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _query = TreasureQuery(
            q: value.trim(),
            tag: _query.tag,
            collectionId: _query.collectionId,
            pinnedOnly: _query.pinnedOnly,
          ));
    });
  }

  void _setCollection(String? id) {
    setState(() => _query = TreasureQuery(
          q: _query.q,
          tag: _query.tag,
          collectionId: id,
          pinnedOnly: _query.pinnedOnly,
        ));
  }

  void _setTag(String? tag) {
    setState(() => _query = TreasureQuery(
          q: _query.q,
          tag: tag,
          collectionId: _query.collectionId,
          pinnedOnly: _query.pinnedOnly,
        ));
  }

  void _refresh() {
    ref.invalidate(treasureProvider(_query));
  }

  void _showHelpIfNeeded(TreasureSaveOutcome outcome) {
    if (outcome.showHelp) {
      ref.read(crisisOverlayProvider.notifier).show();
      return;
    }
    if (outcome.helpOffer) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Help is here if you need it.'),
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: 'Get help',
            onPressed: () => ref.read(crisisOverlayProvider.notifier).show(),
          ),
        ),
      );
    }
  }

  Future<void> _addNote(TreasureResponse data) async {
    final draft = await _openEditor(collections: data.collections);
    if (draft == null) return;

    final outcome = await ref.read(treasureActionsProvider.notifier).create(
          title: draft.title,
          body: draft.body,
          tags: draft.tags,
          collectionId: draft.collectionId,
        );
    if (!mounted) return;

    if (!outcome.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't keep that. Please try again.")),
      );
      return;
    }
    _refresh();
    _showHelpIfNeeded(outcome);
  }

  Future<void> _editNote(TreasureNote note, List<TreasureCollection> collections) async {
    final draft = await _openEditor(collections: collections, existing: note);
    if (draft == null) return;

    final outcome = await ref.read(treasureActionsProvider.notifier).update(
          id: note.id,
          title: draft.title ?? '',
          body: draft.body,
          tags: draft.tags,
          collectionId: draft.collectionId,
          clearCollection: draft.collectionId == null,
        );
    if (!mounted) return;

    if (!outcome.ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't save that. Please try again.")),
      );
      return;
    }
    _refresh();
    _showHelpIfNeeded(outcome);
  }

  Future<void> _deleteNote(TreasureNote note) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this note?'),
        content: const Text(
          'It will be removed from your Treasure Box and from anywhere it was shared. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final ok = await ref.read(treasureActionsProvider.notifier).delete(note.id);
    if (!mounted) return;
    if (ok) {
      _refresh();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't delete that. Please try again.")),
      );
    }
  }

  Future<void> _setPinned(TreasureNote note, bool pinned) async {
    final ok = await ref
        .read(treasureActionsProvider.notifier)
        .setPinned(id: note.id, pinned: pinned);
    if (!mounted) return;
    if (ok) {
      _refresh();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't change that. Please try again.")),
      );
    }
  }

  Future<void> _setShared(TreasureNote note, bool value) async {
    final notifier = ref.read(sharingProvider.notifier);
    if (value) {
      final firstTime = await notifier.shouldConfirmFirstShare();
      if (firstTime) {
        if (!mounted) return;
        final confirmed = await confirmFirstShare(context);
        if (!confirmed) return;
        await notifier.markFirstShareSeen();
      }
    }

    final ok = await notifier.setShared(
      kind: 'treasure_note',
      id: note.id,
      shared: value,
    );
    if (!mounted) return;
    if (ok) {
      _refresh();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't change sharing. Please try again.")),
      );
    }
  }

  /// One pinned note at random. Pinned only — the box's own way back to the
  /// things the client chose to keep close.
  Future<void> _pickOne() async {
    final note = await ref.read(treasureActionsProvider.notifier).pickOne();
    if (!mounted) return;
    if (note == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pin a note you want to come back to first.')),
      );
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(note.title?.isNotEmpty == true ? note.title! : 'From your box'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(note.body, style: const TextStyle(height: 1.5)),
            const SizedBox(height: 12),
            Text(
              note.sourceLabel,
              style: TextStyle(
                fontSize: 12,
                color: AppColors.charcoalInk.withValues(alpha: 0.55),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _newCollection() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New collection'),
        content: TextField(
          key: const Key('treasure_new_collection_name'),
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Open when…'),
          textCapitalization: TextCapitalization.sentences,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;

    final ok = await ref.read(treasureActionsProvider.notifier).createCollection(name);
    if (!mounted) return;
    if (ok) {
      _refresh();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't create that collection.")),
      );
    }
  }

  Future<_NoteDraft?> _openEditor({
    required List<TreasureCollection> collections,
    TreasureNote? existing,
  }) {
    return showModalBottomSheet<_NoteDraft>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => _NoteEditorSheet(
        collections: collections,
        existing: existing,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final box = ref.watch(treasureProvider(_query));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.go('/toolkit'),
        ),
        title: const OkuvuAppBarTitle('Treasure Box'),
        actions: [
          IconButton(
            key: const Key('treasure_search_toggle'),
            tooltip: 'Search your box',
            icon: Icon(_searchOpen ? LucideIcons.x : LucideIcons.search),
            onPressed: () {
              setState(() {
                _searchOpen = !_searchOpen;
                if (!_searchOpen) {
                  _searchController.clear();
                  _query = TreasureQuery(
                    tag: _query.tag,
                    collectionId: _query.collectionId,
                    pinnedOnly: _query.pinnedOnly,
                  );
                }
              });
            },
          ),
        ],
      ),
      floatingActionButton: box.hasValue
          ? FloatingActionButton.extended(
              key: const Key('treasure_add'),
              onPressed: () => _addNote(box.value!),
              backgroundColor: AppColors.royalPurple,
              foregroundColor: Colors.white,
              icon: const Icon(LucideIcons.plus),
              label: const Text('Keep something'),
            )
          : null,
      body: box.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load your Treasure Box.'),
                const SizedBox(height: 12),
                TextButton(onPressed: _refresh, child: const Text('Try again')),
              ],
            ),
          ),
        ),
        data: (data) {
          final allEmpty = data.notes.isEmpty && !_query.isFiltered;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              Text(
                treasurePrivacyLine,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 12),
              if (_searchOpen) ...[
                TextField(
                  key: const Key('treasure_search'),
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search your box',
                    prefixIcon: const Icon(LucideIcons.search, size: 18),
                    isDense: true,
                    filled: true,
                    fillColor: AppColors.oatElevated,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: AppColors.hairline),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              _CollectionChips(
                collections: data.collections,
                selectedId: _query.collectionId,
                onSelected: _setCollection,
                onNew: _newCollection,
              ),
              if (data.tags.isNotEmpty) ...[
                const SizedBox(height: 6),
                _TagChips(tags: data.tags, selected: _query.tag, onSelected: _setTag),
              ],
              const SizedBox(height: 6),
              Row(
                children: [
                  TextButton.icon(
                    key: const Key('treasure_pick_one'),
                    onPressed: _pickOne,
                    icon: const Icon(LucideIcons.sparkles, size: 18, color: AppColors.honey),
                    label: const Text(
                      'Pick one for me',
                      style: TextStyle(color: AppColors.royalPurple),
                    ),
                  ),
                  const Spacer(),
                  if (_query.collectionId != null || _query.tag != null || _query.q?.isNotEmpty == true)
                    TextButton(
                      key: const Key('treasure_clear_filters'),
                      onPressed: () => setState(() => _query = const TreasureQuery()),
                      child: const Text('Clear'),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              if (allEmpty)
                _EmptyBox(onAdd: () => _addNote(data))
              else if (data.notes.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 28),
                  child: Text(
                    'Nothing here for that yet.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                )
              else
                for (final note in data.notes)
                  _NoteCard(
                    key: Key('treasure_note_${note.id}'),
                    note: note,
                    collectionName: _collectionName(data.collections, note.collectionId),
                    onPinned: (value) => _setPinned(note, value),
                    onShared: (value) => _setShared(note, value),
                    onEdit: () => _editNote(note, data.collections),
                    onDelete: () => _deleteNote(note),
                  ),
            ],
          );
        },
      ),
    );
  }

  String? _collectionName(List<TreasureCollection> collections, String? id) {
    if (id == null) return null;
    for (final collection in collections) {
      if (collection.id == id) return collection.name;
    }
    return null;
  }
}

class _EmptyBox extends StatelessWidget {
  const _EmptyBox({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.lavenderWash, AppColors.honeyTint.withValues(alpha: 0.7)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Column(
        children: [
          const Icon(LucideIcons.gift, size: 40, color: AppColors.honeyDeep),
          const SizedBox(height: 14),
          Text(
            treasureEmptyLine,
            key: const Key('treasure_empty_line'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppColors.charcoalInk,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            key: const Key('treasure_empty_add'),
            onPressed: onAdd,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.royalPurple,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(LucideIcons.plus, size: 18),
            label: const Text('Keep your first one'),
          ),
        ],
      ),
    );
  }
}

class _CollectionChips extends StatelessWidget {
  const _CollectionChips({
    required this.collections,
    required this.selectedId,
    required this.onSelected,
    required this.onNew,
  });

  final List<TreasureCollection> collections;
  final String? selectedId;
  final ValueChanged<String?> onSelected;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    if (collections.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 42,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              key: const Key('treasure_collection_all'),
              label: const Text('Everything'),
              selected: selectedId == null,
              onSelected: (_) => onSelected(null),
            ),
          ),
          for (final collection in collections)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                key: Key('treasure_collection_${collection.systemKey ?? collection.id}'),
                label: Text(collection.name),
                selected: selectedId == collection.id,
                onSelected: (_) => onSelected(collection.id),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ActionChip(
              key: const Key('treasure_collection_new'),
              avatar: const Icon(LucideIcons.plus, size: 14),
              label: const Text('New'),
              onPressed: onNew,
            ),
          ),
        ],
      ),
    );
  }
}

class _TagChips extends StatelessWidget {
  const _TagChips({required this.tags, required this.selected, required this.onSelected});

  final List<String> tags;
  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final tag in tags)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                key: Key('treasure_tag_$tag'),
                label: Text(tag, style: const TextStyle(fontSize: 12)),
                selected: selected == tag,
                onSelected: (value) => onSelected(value ? tag : null),
              ),
            ),
        ],
      ),
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({
    super.key,
    required this.note,
    required this.collectionName,
    required this.onPinned,
    required this.onShared,
    required this.onEdit,
    required this.onDelete,
  });

  final TreasureNote note;
  final String? collectionName;
  final ValueChanged<bool> onPinned;
  final ValueChanged<bool> onShared;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 6),
      decoration: BoxDecoration(
        color: AppColors.oatElevated,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: note.pinned ? AppColors.honey.withValues(alpha: 0.55) : AppColors.hairline),
        boxShadow: [
          BoxShadow(
            color: AppColors.royalNight.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    note.title?.isNotEmpty == true ? note.title! : 'A note I kept',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppColors.charcoalInk,
                    ),
                  ),
                ),
              ),
              IconButton(
                key: Key('treasure_pin_${note.id}'),
                visualDensity: VisualDensity.compact,
                tooltip: note.pinned ? 'Unpin' : 'Pin',
                icon: Icon(
                  note.pinned ? LucideIcons.star : LucideIcons.star,
                  size: 18,
                  color: note.pinned
                      ? AppColors.honeyDeep
                      : AppColors.charcoalInk.withValues(alpha: 0.25),
                ),
                onPressed: () => onPinned(!note.pinned),
              ),
              PopupMenuButton<String>(
                key: Key('treasure_menu_${note.id}'),
                tooltip: 'More',
                icon: Icon(
                  LucideIcons.ellipsisVertical,
                  size: 18,
                  color: AppColors.charcoalInk.withValues(alpha: 0.5),
                ),
                onSelected: (value) {
                  if (value == 'edit') onEdit();
                  if (value == 'delete') onDelete();
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Edit')),
                  PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 6, top: 2),
            child: Text(
              note.body,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.charcoalInk,
                height: 1.5,
              ),
            ),
          ),
          if (note.tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8, right: 6),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final tag in note.tags)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.lavenderWash,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        tag,
                        style: const TextStyle(fontSize: 11, color: AppColors.inkSoft),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(LucideIcons.sparkle, size: 13, color: AppColors.honeyDeep),
              const SizedBox(width: 4),
              Text(
                note.sourceLabel,
                key: Key('treasure_source_${note.id}'),
                style: theme.textTheme.labelSmall?.copyWith(color: AppColors.inkSoft),
              ),
              if (collectionName != null) ...[
                const SizedBox(width: 8),
                Icon(
                  LucideIcons.archive,
                  size: 12,
                  color: AppColors.inkSoft.withValues(alpha: 0.8),
                ),
                const SizedBox(width: 3),
                Flexible(
                  child: Text(
                    collectionName!,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(color: AppColors.inkSoft),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              ShareLabel(shared: note.shared),
              const Spacer(),
              Switch(
                key: Key('treasure_share_switch_${note.id}'),
                value: note.shared,
                onChanged: onShared,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _NoteDraft {
  const _NoteDraft({
    required this.title,
    required this.body,
    required this.tags,
    required this.collectionId,
  });

  final String? title;
  final String body;
  final List<String> tags;
  final String? collectionId;
}

/// Write or edit one note: type it or say it, tag it, file it.
class _NoteEditorSheet extends ConsumerStatefulWidget {
  const _NoteEditorSheet({required this.collections, this.existing});

  final List<TreasureCollection> collections;
  final TreasureNote? existing;

  @override
  ConsumerState<_NoteEditorSheet> createState() => _NoteEditorSheetState();
}

class _NoteEditorSheetState extends ConsumerState<_NoteEditorSheet> {
  late final TextEditingController _title;
  late final TextEditingController _body;
  late final TextEditingController _tags;
  String? _collectionId;
  bool _listening = false;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.existing?.title ?? '');
    _body = TextEditingController(text: widget.existing?.body ?? '');
    _tags = TextEditingController(text: widget.existing?.tags.join(', ') ?? '');
    _collectionId = widget.existing?.collectionId;
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _tags.dispose();
    super.dispose();
  }

  Future<void> _toggleListening() async {
    final speech = ref.read(speechServiceProvider);
    if (_listening) {
      await speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }

    final outcome = await speech.start(
      onWords: (words, isFinal) {
        if (mounted) setState(() => _body.text = words);
      },
      onEnded: () {
        if (mounted) setState(() => _listening = false);
      },
    );
    if (!mounted) return;
    if (outcome == SpeechStartOutcome.listening) {
      setState(() => _listening = true);
      return;
    }
    final message = switch (outcome) {
      SpeechStartOutcome.permissionDenied => 'OKUVU needs the microphone to hear you.',
      SpeechStartOutcome.permissionBlocked =>
        'The microphone is off for OKUVU. You can turn it on in Settings.',
      SpeechStartOutcome.unavailable => "This phone can't listen right now. You can type instead.",
      _ => "Couldn't start listening. You can type instead.",
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _save() {
    final body = _body.text.trim();
    if (body.isEmpty) return;
    final tags = _tags.text
        .split(',')
        .map((tag) => tag.trim())
        .where((tag) => tag.isNotEmpty)
        .toList();
    Navigator.of(context).pop(
      _NoteDraft(
        title: _title.text.trim().isEmpty ? null : _title.text.trim(),
        body: body,
        tags: tags,
        collectionId: _collectionId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final editing = widget.existing != null;
    final insets = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: insets),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.oat,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: AppColors.hairline,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              Text(
                editing ? 'Edit this note' : 'Keep something',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.charcoalInk,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                key: const Key('treasure_editor_body'),
                controller: _body,
                autofocus: !editing,
                maxLines: 6,
                minLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'Words that help, something you learnt, a step that worked…',
                  filled: true,
                  fillColor: AppColors.oatElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.hairline),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton.icon(
                    key: const Key('treasure_editor_mic'),
                    onPressed: _toggleListening,
                    icon: Icon(
                      _listening ? LucideIcons.circleDot : LucideIcons.mic,
                      size: 18,
                      color: _listening ? theme.colorScheme.error : AppColors.royalPurple,
                    ),
                    label: Text(
                      _listening ? 'Listening…' : 'Say it instead',
                      style: const TextStyle(color: AppColors.royalPurple),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              TextField(
                key: const Key('treasure_editor_title'),
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'A title, if you want one',
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.oatElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.hairline),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('treasure_editor_tags'),
                controller: _tags,
                decoration: InputDecoration(
                  hintText: 'Tags, separated by commas',
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.oatElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.hairline),
                  ),
                ),
              ),
              if (widget.collections.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  'Keep it in',
                  style: theme.textTheme.labelMedium?.copyWith(color: AppColors.inkSoft),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ChoiceChip(
                      key: const Key('treasure_editor_collection_none'),
                      label: const Text('Nowhere in particular'),
                      selected: _collectionId == null,
                      onSelected: (_) => setState(() => _collectionId = null),
                    ),
                    for (final collection in widget.collections)
                      ChoiceChip(
                        key: Key('treasure_editor_collection_${collection.systemKey ?? collection.id}'),
                        label: Text(collection.name),
                        selected: _collectionId == collection.id,
                        onSelected: (_) => setState(() => _collectionId = collection.id),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const Key('treasure_editor_save'),
                  onPressed: _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.royalPurple,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(editing ? 'Save' : 'Keep it'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
