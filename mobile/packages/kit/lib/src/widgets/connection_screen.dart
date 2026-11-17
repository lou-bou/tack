import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/connection.dart';
import '../providers.dart';
import '../theme/tokens.dart';
import 'basics.dart';
import 'forms.dart';
import 'toast.dart';

/// First-run and Settings screen for the server address and the Cloudflare Access service token.
///
/// Nothing is saved until a test request with the entered values succeeds.
class ConnectionScreen extends ConsumerStatefulWidget {
  const ConnectionScreen({
    super.key,
    required this.appName,
    required this.healthPath,
    required this.isHealthy,
    this.header,
    this.onSaved,
    this.firstRun = false,
  });

  final String appName;

  /// A cheap GET that proves the right server answered, e.g. `/api/health`.
  final String healthPath;
  final bool Function(dynamic json) isHealthy;

  /// Shown above the form on first run (the app's logo).
  final Widget? header;
  final VoidCallback? onSaved;
  final bool firstRun;

  @override
  ConsumerState<ConnectionScreen> createState() => _ConnectionScreenState();
}

class _ConnectionScreenState extends ConsumerState<ConnectionScreen> {
  late final TextEditingController _url;
  late final TextEditingController _id;
  late final TextEditingController _secret;
  bool _showSecret = false;
  bool _busy = false;
  String? _urlError;
  String? _error;
  final _errorKey = GlobalKey();

  /// Bring the explanation into view; it sits below the fields and may be off screen.
  void _revealError() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _errorKey.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, duration: Motion.base, alignment: 0.5);
      }
    });
  }

  @override
  void initState() {
    super.initState();
    final c = ref.read(connectionProvider);
    _url = TextEditingController(text: c?.baseUrl ?? '');
    _id = TextEditingController(text: c?.clientId ?? '');
    _secret = TextEditingController(text: c?.clientSecret ?? '');
  }

  @override
  void dispose() {
    _url.dispose();
    _id.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final parsed = ServerConnection.parseSetup(data?.text ?? '');
    if (parsed == null) {
      Toasts.show('Nothing usable on the clipboard');
      return;
    }
    setState(() {
      if (parsed.baseUrl.isNotEmpty) _url.text = parsed.baseUrl;
      if (parsed.clientId.isNotEmpty) _id.text = parsed.clientId;
      if (parsed.clientSecret.isNotEmpty) _secret.text = parsed.clientSecret;
      _error = null;
    });
  }

  Future<void> _copy() async {
    final c = _current();
    await Clipboard.setData(ClipboardData(text: c.toSetupString()));
    Toasts.show('Setup copied. Paste it into the next app.');
  }

  ServerConnection _current() => ServerConnection(
    baseUrl: ServerConnection.normalizeUrl(_url.text),
    clientId: _id.text.trim(),
    clientSecret: _secret.text.trim(),
  );

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final urlError = ServerConnection.validateUrl(_url.text);
    final conn = _current();
    String? error;
    if (urlError == null && conn.clientId.isEmpty != conn.clientSecret.isEmpty) {
      error = 'Enter both the client ID and the client secret, or leave both empty.';
    }
    setState(() {
      _urlError = urlError;
      _error = error;
    });
    if (urlError != null || error != null) return;

    setState(() => _busy = true);
    try {
      final json = await ApiClient.probe(conn, widget.healthPath, dio: ref.read(dioProvider));
      if (!widget.isHealthy(json)) {
        throw ApiException(
          ApiFailure.badResponse,
          'That server answered, but it is not ${widget.appName}.',
        );
      }
      await ref.read(connectionProvider.notifier).save(conn);
      if (!mounted) return;
      Toasts.show('Connected');
      widget.onSaved?.call();
    } on ApiException catch (e) {
      setState(() => _error = _explain(e, conn));
      _revealError();
    } catch (_) {
      setState(() => _error = 'Could not save the connection on this device.');
      _revealError();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _explain(ApiException e, ServerConnection conn) => switch (e.kind) {
    ApiFailure.accessDenied =>
      conn.hasToken
          ? 'Cloudflare Access refused this service token. Check the ID and secret, and that '
                'the Access application has a Service Auth policy that includes the token.'
          : 'This server is behind Cloudflare Access. Enter a service token.',
    ApiFailure.network =>
      "Can't reach ${Uri.tryParse(conn.baseUrl)?.host ?? 'the server'}. Check the address and "
          'your connection.',
    ApiFailure.serverDown =>
      'Cloudflare answered but the server behind it is not running right now.',
    ApiFailure.badResponse => e.message,
    _ => e.message,
  };

  @override
  Widget build(BuildContext context) {
    final t = context.kit;
    final mono = context.text.bodyLarge!.copyWith(fontSize: 14);
    final existing = ref.watch(connectionProvider);

    return Scaffold(
      appBar: widget.firstRun ? null : AppBar(title: const Text('Connection')),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(Space.s5, Space.s5, Space.s5, Space.s8),
          children: [
            if (widget.firstRun) ...[
              const SizedBox(height: Space.s6),
              if (widget.header != null) Center(child: widget.header),
              const SizedBox(height: Space.s6),
              Text('Connect to your server', style: context.text.headlineMedium),
              const SizedBox(height: Space.s2),
              Text(
                'Enter the address of your ${widget.appName} server and the Cloudflare Access '
                'service token. They are stored in this phone’s secure keystore and nowhere else.',
                style: context.text.bodyLarge!.copyWith(color: t.textMuted),
              ),
              const SizedBox(height: Space.s6),
            ],
            KitField(
              label: 'Server address',
              error: _urlError,
              child: TextField(
                controller: _url,
                keyboardType: TextInputType.url,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  hintText: 'https://${widget.appName.toLowerCase()}.example.com',
                  error: _urlError == null ? null : const SizedBox.shrink(),
                ),
              ),
            ),
            const SizedBox(height: Space.s4),
            KitField(
              label: 'CF-Access-Client-Id',
              child: TextField(
                controller: _id,
                style: mono,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(hintText: 'xxxxxxxx.access'),
              ),
            ),
            const SizedBox(height: Space.s4),
            KitField(
              label: 'CF-Access-Client-Secret',
              hint: 'Leave both token fields empty only if the server is not behind Access.',
              child: TextField(
                controller: _secret,
                style: mono,
                obscureText: !_showSecret,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _save(),
                decoration: InputDecoration(
                  suffixIcon: IconButton(
                    tooltip: _showSecret ? 'Hide secret' : 'Show secret',
                    icon: Icon(
                      _showSecret ? LucideIcons.eyeOff : LucideIcons.eye,
                      size: 18,
                      color: t.textMuted,
                    ),
                    onPressed: () => setState(() => _showSecret = !_showSecret),
                  ),
                ),
              ),
            ),
            const SizedBox(height: Space.s4),
            Row(
              children: [
                KitButton(
                  label: 'Paste setup',
                  icon: LucideIcons.clipboardPaste,
                  small: true,
                  onPressed: _paste,
                ),
                if (existing != null) ...[
                  const SizedBox(width: Space.s2),
                  KitButton(
                    label: 'Copy setup',
                    icon: LucideIcons.copy,
                    small: true,
                    onPressed: _copy,
                  ),
                ],
              ],
            ),
            const SizedBox(height: Space.s5),
            FormError(_error, key: _errorKey),
            if (_error != null) const SizedBox(height: Space.s4),
            KitButton(
              label: _busy ? 'Testing…' : 'Test and save',
              variant: ButtonVariant.primary,
              block: true,
              busy: _busy,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
