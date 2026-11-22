// Windows' own voices (no download needed): OneCore voices ("Microsoft Katja", "Microsoft Stefan") and
// the older SAPI desktop voices. A Windows PowerShell process renders texts to WAV files. (From GT Toolz.)

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

export interface WindowsVoiceInfo {
  engine: 'onecore' | 'sapi';
  name: string;
  language: string;
}

const SCRIPT = `
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$wanted = '__VOICE__'
$lang = '__LANG__'
$rate = __RATE__
$oneCore = $null

$oneCoreVoices = @()
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $oneCoreVoices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices)
} catch { }
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sapiVoices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled })

if ($wanted -eq '*list*') {
  foreach ($v in $oneCoreVoices) { [Console]::Out.WriteLine('voice|onecore|' + $v.DisplayName + '|' + $v.Language) }
  foreach ($v in $sapiVoices) { [Console]::Out.WriteLine('voice|sapi|' + $v.VoiceInfo.Name + '|' + $v.VoiceInfo.Culture.Name) }
  [Console]::Out.WriteLine('listed|')
  exit
}

$engine = 'sapi'
$match = $oneCoreVoices | Where-Object { $_.DisplayName -eq $wanted } | Select-Object -First 1
if ($match) {
  $engine = 'onecore'
  $oneCore = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $oneCore.Voice = $match
  $oneCore.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(3.0, 1.0 + $rate * 0.1))
  # AsTask<TResult>(IAsyncOperation<TResult>): turns the WinRT speech operations into .NET tasks to wait for.
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
  } | Select-Object -First 1
  $name = $match.DisplayName
} else {
  $voice = $sapiVoices | Where-Object { $_.VoiceInfo.Name -eq $wanted } | Select-Object -First 1
  if (-not $voice) { $voice = $sapiVoices | Where-Object { $_.VoiceInfo.Culture.Name.StartsWith($lang) } | Select-Object -First 1 }
  if (-not $voice) { $voice = $sapiVoices | Select-Object -First 1 }
  if ($voice) { $s.SelectVoice($voice.VoiceInfo.Name) }
  $s.Rate = $rate
  $name = $s.Voice.Name
}
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

function Render($text, $file) {
  if ($oneCore) {
    $synthesis = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($oneCore.SynthesizeTextToStreamAsync($text)))
    $stream = $synthesis.GetAwaiter().GetResult()
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $size = [uint32]$stream.Size
    $null = $asTask.MakeGenericMethod([uint32]).Invoke($null, @($reader.LoadAsync($size))).GetAwaiter().GetResult()
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($file, $bytes)
  } else {
    $s.SetOutputToWaveFile($file, $fmt); $s.Speak($text); $s.SetOutputToNull()
  }
}

[Console]::Out.WriteLine('ready|' + $name + '|' + $engine)
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split('|', 3)
  if ($parts[0] -eq 'render') {
    try { Render $parts[1] $parts[2] } catch { }
    [Console]::Out.WriteLine('rendered|' + $parts[2])
  }
}
`;

function startScript(voice: string, rate: number, locale = 'de-DE'): ChildProcessWithoutNullStreams {
  const language = (locale.split('-')[0] ?? 'de').replace(/[^a-zA-Z]/g, '');
  // Replacer functions: a "$'" or "$&" in a value would otherwise be expanded by String.replace and land
  // in the script as code. Inside the single-quoted PowerShell string only a quote needs doubling.
  const name = voice.replace(/[\p{Cc}]/gu, '').replace(/'/g, "''");
  const script = SCRIPT.replace('__VOICE__', () => name)
    .replace('__LANG__', () => language)
    .replace('__RATE__', () => String(Math.max(-10, Math.min(10, Math.round(rate)))));
  // Windows PowerShell 5.1 ships System.Speech and the WinRT bridge; PowerShell 7 does not.
  // Full path: never a powershell.exe that happens to be first on the PATH.
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return spawn(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

/** Lists the installed Windows voices (OneCore first, then SAPI); none on other platforms. */
export function listWindowsVoices(): Promise<WindowsVoiceInfo[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve) => {
    const child = startScript('*list*', 0);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.resume();
    child.on('error', () => resolve([]));
    child.on('close', () => {
      resolve(
        output
          .split(/\r?\n/)
          .filter((line) => line.startsWith('voice|'))
          .map((line) => {
            const [, engine, name, language] = line.split('|');
            return { engine: engine === 'onecore' ? 'onecore' : 'sapi', name: name ?? '', language: language ?? '' };
          }),
      );
    });
  });
}

/** One Windows PowerShell process rendering with one voice; answers come back line by line. */
export class WindowsRenderer {
  private buffer = '';
  private readonly waiters: { prefix: string; resolve: (rest: string) => void; reject: (err: Error) => void }[] = [];
  private closed = false;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    public name = '',
    public engine: 'onecore' | 'sapi' = 'sapi',
  ) {
    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        const index = this.waiters.findIndex((w) => line.startsWith(w.prefix));
        if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(line.slice(line.indexOf('|') + 1));
      }
    });
    child.stderr.resume();
    // A dead process must not leave anyone waiting, nor crash the host with a write error.
    const ended = (reason: string) => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`Speech process ${reason}`));
    };
    child.on('error', (err) => ended(`could not be started: ${err.message}`));
    child.on('exit', (code) => ended(`ended (exit code ${code})`));
    child.stdin.on('error', () => ended('closed its input'));
  }

  static async start(voice: string, rate: number, locale?: string): Promise<WindowsRenderer> {
    if (process.platform !== 'win32') throw new Error('Windows voices exist only on Windows');
    const renderer = new WindowsRenderer(startScript(voice, rate, locale));
    const [name, engine] = (await renderer.waitFor('ready|')).split('|');
    renderer.name = name ?? '';
    renderer.engine = engine === 'onecore' ? 'onecore' : 'sapi';
    return renderer;
  }

  get alive(): boolean {
    return !this.closed;
  }

  async render(text: string, file: string): Promise<void> {
    this.send(`render|${text.replace(/[|\r\n]+/g, ' ')}|${file}`);
    await this.waitFor('rendered|');
  }

  close(): void {
    if (!this.closed) this.child.stdin.end();
    this.closed = true;
  }

  private send(line: string): void {
    if (!this.closed) this.child.stdin.write(`${line}\n`, 'utf8');
  }

  private waitFor(prefix: string): Promise<string> {
    if (this.closed) return Promise.reject(new Error('Speech process closed'));
    return new Promise((resolve, reject) => this.waiters.push({ prefix, resolve, reject }));
  }
}
