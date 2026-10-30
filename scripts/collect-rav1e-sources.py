#!/usr/bin/env python3
"""Collect the exact rav1e source closure used by BtbN run 40871264069.

Python 3.11+ and Cargo are required. Downloads source archives only; never
executes downloaded build scripts or binaries. GITHUB_TOKEN is used only for
the GitHub job-log API and is never sent to the redirected storage URL.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import tomllib
import urllib.error
import urllib.request
import zipfile

REV = '31435de9d76fddd38f6dcc31d4014574cebb2092'
JOB = 123535205184
UPDATES = {('cc', '1.10.0'), ('find-msvc-tools', '0.1.15'), ('shlex', '2.0.1')}
UA = {'User-Agent': 'Liying-FFmpeg-corresponding-source/1.0'}


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def get(url, headers=None):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or UA), timeout=120) as response:
                return response.read()
        except Exception:
            if attempt == 5:
                raise RuntimeError('Source download failed; retry the collector') from None
            time.sleep(min(2 ** attempt, 15))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def job_log():
    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if not token:
        raise RuntimeError('Pass --log, or set GITHUB_TOKEN with public Actions read access')
    headers = dict(UA, Authorization='Bearer ' + token, Accept='application/vnd.github+json')
    req = urllib.request.Request(f'https://api.github.com/repos/BtbN/FFmpeg-Builds/actions/jobs/{JOB}/logs', headers=headers)
    try:
        urllib.request.build_opener(NoRedirect).open(req, timeout=60)
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise RuntimeError(f'Public Actions log request failed: HTTP {error.code}') from None
        location = error.headers['Location']
    else:
        raise RuntimeError('Expected a signed Actions log download redirect')
    return get(location)


def index_path(name):
    name = name.lower()
    return '1/' + name if len(name) == 1 else ('2/' + name if len(name) == 2 else ('3/' + name[0] + '/' + name if len(name) == 3 else name[:2] + '/' + name[2:4] + '/' + name))


def extract_archive(archive, directory, prefix):
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            if member.name.split('/')[0] != prefix:
                raise RuntimeError('Unexpected archive root')
        source.extractall(directory, filter='data')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--log', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    package = output / 'rav1e-sources'
    package.mkdir(exist_ok=True)
    downloads = output / 'source-downloads'
    downloads.mkdir(exist_ok=True)
    evidence = package / 'evidence'
    evidence.mkdir(exist_ok=True)

    log = args.log.read_bytes() if args.log else job_log()
    log_text = log.decode('utf-8-sig', errors='strict')
    lines = log_text.splitlines()
    stages = {re.search(r'#(\d+) ', line).group(1) for line in lines if '+ cargo update cc' in line and re.search(r'#(\d+) ', line)}
    if len(stages) != 1:
        raise RuntimeError('Cannot identify the unique rav1e cargo update stage')
    stage = stages.pop()
    stage_lines = [line for line in lines if re.search(r'#' + stage + r'\b', line)]
    stage_text = '\n'.join(stage_lines) + '\n'
    if REV not in stage_text or 'Finished `release`' not in stage_text:
        raise RuntimeError('The log does not prove this rav1e revision completed')
    updates = set()
    removals = set()
    for line in stage_lines:
        change = re.search(r'Updating ([\w-]+) v([^ ]+) -> v([^ ]+)', line)
        add = re.search(r'Adding ([\w-]+) v([^ ]+)', line)
        remove = re.search(r'Removing ([\w-]+) v([^ ]+)', line)
        if change:
            removals.add((change[1], change[2])); updates.add((change[1], change[3]))
        if add:
            updates.add((add[1], add[2]))
        if remove:
            removals.add((remove[1], remove[2]))
    if updates != UPDATES or removals != {('cc', '1.2.26')}:
        raise RuntimeError('Unexpected dependency changes; do not substitute current crate versions')
    (evidence / 'rav1e-build-stage.log').write_text(stage_text, encoding='utf-8')
    (evidence / 'build-log-provenance.json').write_text(json.dumps({
        'run': 40871264069, 'job': JOB, 'stage': stage,
        'job_url': f'https://github.com/BtbN/FFmpeg-Builds/actions/runs/40871264069/job/{JOB}',
        'full_job_log_sha256': hashlib.sha256(log).hexdigest(),
        'added_or_updated': sorted(updates), 'removed': sorted(removals)
    }, indent=2) + '\n', encoding='utf-8')

    source_archive = downloads / ('rav1e-' + REV + '.tar.gz')
    if not source_archive.exists():
        source_archive.write_bytes(get('https://codeload.github.com/xiph/rav1e/tar.gz/' + REV))
    extract_archive(source_archive, package, 'rav1e-' + REV)
    rav1e = package / ('rav1e-' + REV)
    original_lock = (rav1e / 'Cargo.lock').read_bytes()
    (evidence / 'Cargo.lock.original').write_bytes(original_lock)
    lock = tomllib.loads(original_lock.decode())
    packages = {(p['name'], p['version']): p['checksum'] for p in lock['package'] if p.get('source', '').startswith('registry+')}
    if len(packages) != 273 or ('cc', '1.2.26') not in packages:
        raise RuntimeError('Unexpected original dependency lock')
    if any(p.get('source', '').startswith('git+') for p in lock['package']):
        raise RuntimeError('Uncollected Git dependency')
    original_packages = set(packages)
    for name, version in sorted(updates):
        data = get('https://index.crates.io/' + index_path(name)).decode()
        entries = [json.loads(line) for line in data.splitlines()]
        entry = next((p for p in entries if p['vers'] == version), None)
        if entry is None:
            raise RuntimeError(f'Exact registry version unavailable: {name} {version}')
        packages[(name, version)] = entry['cksum']
        (evidence / f'index-{name}-{version}.json').write_text(json.dumps(entry, indent=2) + '\n', encoding='utf-8')

    vendor = package / 'vendor'
    vendor.mkdir(exist_ok=True)

    def collect(item):
        (name, version), checksum = item
        archive = downloads / f'{name}-{version}.crate'
        url = f'https://static.crates.io/crates/{name}/{name}-{version}.crate'
        if not archive.exists() or sha(archive) != checksum:
            archive.write_bytes(get(url))
        if sha(archive) != checksum:
            raise RuntimeError(f'Registry checksum mismatch: {name} {version}')
        extract_archive(archive, vendor, f'{name}-{version}')
        crate = vendor / f'{name}-{version}'
        files = {str(p.relative_to(crate)).replace('\\', '/'): sha(p) for p in sorted(crate.rglob('*')) if p.is_file() and p.name != '.cargo-checksum.json'}
        (crate / '.cargo-checksum.json').write_text(json.dumps({'files': files, 'package': checksum}, sort_keys=True), encoding='utf-8')
        metadata = tomllib.loads((crate / 'Cargo.toml').read_text(encoding='utf-8'))['package']
        return {'name': name, 'version': version, 'sha256': checksum, 'source_url': url,
                'license': metadata.get('license'), 'license_file': metadata.get('license-file'),
                'archive_bytes': archive.stat().st_size,
                'present_in_original_lock': (name, version) in original_packages,
                'present_in_effective_lock': (name, version) not in removals}

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        records = list(pool.map(collect, sorted(packages.items())))
    (package / 'CRATE_SOURCES.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
    # libfuzzer-sys retains LLVM source headers but its crate only ships the
    # wrapper's MIT/Apache texts. Preserve the exception text from the exact
    # LLVM revision pinned by that crate, outside the checksum-verified vendor.
    llvm_revision = 'ab51eccf88f5321e7c60591c5546b254b6afab99'
    updater = (vendor / 'libfuzzer-sys-0.4.9' / 'update-libfuzzer.sh').read_text()
    if 'COMMIT=' + llvm_revision not in updater:
        raise RuntimeError('Unexpected vendored libfuzzer upstream revision')
    notices = package / 'supplemental-notices'
    notices.mkdir(exist_ok=True)
    llvm_url = f'https://raw.githubusercontent.com/llvm/llvm-project/{llvm_revision}/LICENSE.TXT'
    llvm_license = get(llvm_url)
    if b'LLVM Exceptions' not in llvm_license:
        raise RuntimeError('Unexpected LLVM license text')
    (notices / 'LLVM-LICENSE.TXT').write_bytes(llvm_license)
    (notices / 'README.md').write_text('The vendored libfuzzer-sys 0.4.9 update-libfuzzer.sh pins LLVM commit ' + llvm_revision + '. Its embedded source headers name Apache-2.0 WITH LLVM-exception. This is the unchanged root license text from that exact upstream commit:\n\n' + llvm_url + '\n\nSHA-256: ' + hashlib.sha256(llvm_license).hexdigest() + '\n', encoding='utf-8')
    config = rav1e / '.cargo'
    config.mkdir(exist_ok=True)
    (config / 'config.toml').write_text('[source.crates-io]\nreplace-with = "vendored-sources"\n\n[source.vendored-sources]\ndirectory = "../vendor"\n\n[net]\noffline = true\n', encoding='utf-8')
    if not shutil.which('cargo'):
        raise RuntimeError('Cargo is required to reconstruct and check the exact offline lock')
    result = subprocess.run(['cargo', 'update', '--offline', '-p', 'cc@1.2.26', '--precise', '1.10.0'], cwd=rav1e, capture_output=True, text=True)
    (evidence / 'offline-lock-reconstruction.log').write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Offline lock reconstruction failed; see evidence log')
    actual = {(p['name'], p['version']) for p in tomllib.loads((rav1e / 'Cargo.lock').read_text())['package'] if p.get('source', '').startswith('registry+')}
    expected = (original_packages - removals) | updates
    if actual != expected:
        raise RuntimeError('Offline resolved versions differ from the original lock plus the actual build log')
    result = subprocess.run(['cargo', 'metadata', '--offline', '--locked', '--format-version', '1'], cwd=rav1e, capture_output=True, text=True)
    if result.returncode:
        (evidence / 'offline-metadata-error.log').write_text(result.stderr, encoding='utf-8')
        raise RuntimeError('Offline locked metadata check failed')
    (evidence / 'Cargo.lock.reconstructed').write_bytes((rav1e / 'Cargo.lock').read_bytes())
    (package / 'README.md').write_text(f'''# Matching rav1e / Rust source supplement

For BtbN FFmpeg-Builds run 40871264069, job {JOB}, win64-gpl-9.0.
rav1e revision: {REV}. Its BSD-2-Clause LICENSE and PATENTS are retained.
Every vendored crate retains its own source and license notices; declarations
and upstream archive SHA-256 values are listed in CRATE_SOURCES.json.

The original Cargo.lock names 273 registry packages. The actual build log
updates cc 1.2.26 to 1.10.0 and adds find-msvc-tools 0.1.15 and shlex 2.0.1.
This archive contains all 273 original packages plus these three exact
versions (276 source packages; 275 in the effective lock). The unused older
cc source is intentionally retained. No current/latest crate versions are used.

The effective Cargo.lock is reconstructed from the original lock using only
this vendored source set. Its complete package/version set was checked against
the original lock plus the actual logged changes. It is a reconstructed lock,
not a lock file recovered from the original Docker build. Cargo's locked,
offline metadata resolution succeeded without building or executing crates.

Run from the rav1e source directory:
  cargo metadata --offline --locked --format-version 1
The .cargo/config.toml points to ../vendor and disables network access.
For a BtbN rebuild, copy this rav1e directory and vendor together into its
rav1e build stage; replace the moving `cargo update cc` with the supplied
Cargo.lock and keep Cargo offline. Retain all compiler/target environment
settings and cargo cinstall arguments from the exact upstream recipe.

This supplement accompanies the matching full dependency cache, FFmpeg source,
and build recipes; it does not claim a self-contained toolchain or byte-for-byte
reproducibility. Build log evidence and original/reconstructed locks are in
evidence/. The GPL license for the combined FFmpeg executable does not replace
the individual permissive notices in this directory.
''', encoding='utf-8')
    shutil.copy2(Path(__file__), package / Path(__file__).name)
    checksums = [(sha(path), path.relative_to(package).as_posix()) for path in sorted(package.rglob('*')) if path.is_file() and path.name != 'SHA256SUMS']
    (package / 'SHA256SUMS').write_text(''.join(f'{checksum}  {name}\n' for checksum, name in checksums), encoding='utf-8')
    archive = output / 'rav1e-rust-sources-run-40871264069.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as z:
        for path in sorted(package.rglob('*')):
            if path.is_file():
                z.write(path, path.relative_to(output).as_posix())
    report = {'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive),
              'rav1e_source_archive_sha256': sha(source_archive), 'vendored_packages': len(records),
              'effective_lock_packages': len(actual), 'offline_locked_metadata_check': 'passed'}
    (output / 'rav1e-source-supplement-manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
