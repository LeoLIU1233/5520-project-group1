import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, keccak256, isAddress } from 'ethers';
import { ShieldCheck, FileCheck2, Building2, Settings2, Upload, FileText, Check, CircleCheck, CircleX, CircleHelp, Ban, Download, Wallet, RefreshCw, Copy, LockKeyhole, Layers3, Activity, LoaderCircle, ChevronDown, FlaskConical, AlertTriangle, X, FolderOpen, BookOpen } from 'lucide-react';
import { Documents, Profiles, BeginnerGuide } from './v2.jsx';
import { assertBytes32, computeCommitment, createVerificationPackage, hashDocument, newCredentialId, newSalt, parseVerificationPackage, STATUS } from '../../shared/credential.mjs';
import './styles.css';

const NAV = [
  { id: 'verify', label: 'Verify credentials', en: 'Check integrity & status', icon: FileCheck2 },
  { id: 'issue', label: 'Issuer workspace', en: 'Register & revoke', icon: Building2 },
  { id: 'documents', label: 'Credential records', en: 'Records & verification packages', icon: FolderOpen },
  { id: 'admin', label: 'Administration', en: 'Manage issuer permissions', icon: Settings2 },
  { id: 'help', label: 'Beginner guide', en: 'Step-by-step help', icon: BookOpen },
];
const PAGE_COPY = {
  verify: ['Every credential. A verifiable record.', 'Check the original file and its revocation status. No wallet or transaction fee required.'],
  issue: ['Give every credential a trusted record.', 'Verification data is backed up locally before issuance. Normal restarts preserve your records.'],
  documents: ['Find the record. Recover the verification package.', 'Search credentials and check their history. Sign in to re-export your own verification packages.'],
  admin: ['Clear permissions. Traceable actions.', 'Manage issuer names and wallet permissions while preserving credential history.'],
  help: ['From your first click to a complete demonstration.', 'Follow the steps to verify, authorise, issue, revoke and use an independent wallet.'],
};
const RESULTS = {
  VALID: { title: 'File matches. Credential is valid.', text: 'This file matches the registered fingerprint and the credential has not been revoked.', icon: CircleCheck, theme: 'valid' },
  HASH_MISMATCH: { title: 'File or verification data mismatch', text: 'The file may have changed, or the salt may be incorrect. Check the original PDF and its verification package.', icon: CircleX, theme: 'mismatch' },
  REVOKED: { title: 'File matches. Credential is revoked.', text: 'The file matches the registered record, but the issuer or administrator has revoked the credential.', icon: Ban, theme: 'revoked' },
  NOT_FOUND: { title: 'No registration found', text: 'This credential ID is not registered in the current contract. Check the ID and deployment.', icon: CircleHelp, theme: 'missing' },
};
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
const date = value => Number(value) ? new Date(Number(value) * 1000).toLocaleString('en-GB', { hour12: false }) : '—';

function explainError(error) {
  const name = error.revert?.name;
  const data = error.data ?? error.info?.error?.data?.data ?? error.info?.error?.data;
  const text = `${error.shortMessage ?? ''} ${error.message ?? ''} ${typeof data === 'string' ? data : ''}`;
  if (name === 'AccessControlUnauthorizedAccount' || /AccessControlUnauthorizedAccount/.test(text)) return 'The contract rejected this action: the current account does not have the required permission.';
  if (name === 'NotCredentialIssuerOrAdmin' || /NotCredentialIssuerOrAdmin/.test(text)) return 'Revocation rejected: only the original issuer or an administrator can revoke this credential.';
  if (name === 'CredentialAlreadyExists' || /CredentialAlreadyExists/.test(text)) return 'This credential ID is already registered and cannot be overwritten.';
  if (name === 'CredentialAlreadyRevoked' || /CredentialAlreadyRevoked/.test(text)) return 'This credential has already been revoked.';
  if (name === 'CredentialNotFound' || /CredentialNotFound/.test(text)) return 'No registration was found for this credential.';
  if (error.code === 'ACTION_REJECTED' || error.code === 4001) return 'You cancelled the wallet request. No transaction was submitted.';
  if (/fetch|network|ECONNREFUSED|could not coalesce|failed to detect/i.test(text)) return 'Cannot connect to the local test chain. Keep the launch window running, then reconnect.';
  return error.shortMessage || error.message || 'The action failed. Please try again.';
}

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function assertDeployment(registry, config) {
  if (await registry.deploymentId() !== config.deploymentId) {
    throw new Error('The test chain deployment has changed. Reconnect and use verification packages from the current session.');
  }
}

function CopyValue({ value, label, compact = false }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="copy-value" title={value} aria-label={`Copy ${label || 'value'}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* Browser may deny clipboard. */ }
  }}><span className="mono">{compact ? short(value) : value}</span>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>;
}

function Dropzone({ file, onFile, label = 'Credential PDF', disabled = false }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  return <div className={`dropzone ${file ? 'has-file' : ''} ${dragging ? 'dragging' : ''}`}
    onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept=".pdf,application/pdf" aria-label={label} disabled={disabled}
      onChange={event => { if (event.target.files[0]) onFile(event.target.files[0]); event.target.value = ''; }} />
    <div className="file-icon">{file ? <FileText size={25}/> : <Upload size={25}/>}</div>
    <strong>{file ? file.name : 'Drop the credential PDF here'}</strong>
    <span>{file ? `${(file.size / 1024).toFixed(1)} KB · Fingerprint computed in your browser` : 'PDF up to 20 MB. File contents stay off-chain.'}</span>
    <button type="button" className="button secondary small" disabled={disabled} onClick={() => input.current.click()}>{file ? 'Change file' : 'Choose PDF'}</button>
  </div>;
}

function TransactionNotice({ notice, onClose }) {
  if (!notice) return null;
  return <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
    {notice.kind === 'pending' ? <LoaderCircle className="spin" size={18}/> : notice.kind === 'error' ? <AlertTriangle size={18}/> : <CircleCheck size={18}/>}
    <div><strong>{notice.message}</strong>{notice.hash && <div className="notice-hash">Transaction <CopyValue value={notice.hash} label="transaction hash" compact/></div>}</div>
    {notice.kind !== 'pending' && <button className="icon-button" aria-label="Dismiss notification" onClick={onClose}><X size={17}/></button>}
  </div>;
}

function App() {
  const [tab, setTab] = useState('verify');
  const [config, setConfig] = useState(null);
  const [rpc, setRpc] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState('demo');
  const [accountIndex, setAccountIndex] = useState(1);
  const [walletAddress, setWalletAddress] = useState('');
  const [roles, setRoles] = useState({ admin: false, issuer: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [stats, setStats] = useState({ issued: 0, revoked: 0 });
  const [events, setEvents] = useState([]);
  const [issuers, setIssuers] = useState([]);
  const [lastIssued, setLastIssued] = useState(null);
  const [session, setSession] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [balance, setBalance] = useState('0');
  const tokenRef = useRef(null);
  const pendingAuth = useRef(null);
  const activeRef = useRef(null);
  const walletProvider = useRef(null);
  const demoAddress = config?.demoAccounts[accountIndex]?.address;
  const activeAddress = mode === 'demo' ? demoAddress : walletAddress;
  activeRef.current = activeAddress?.toLowerCase();

  useEffect(() => { tokenRef.current = null; setSession(null); setLastIssued(null); }, [activeAddress, mode]);

  async function apiRequest(route, options = {}, explicitToken) {
    const token = explicitToken ?? (tokenRef.current?.address === activeRef.current ? tokenRef.current.token : null);
    const response = await fetch(route, {
      method: options.method || 'GET', cache: 'no-store',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401) { tokenRef.current = null; setSession(null); }
      throw new Error(value.error || 'The local records service could not complete the action.');
    }
    return value;
  }

  async function ensureSession() {
    const address = activeRef.current;
    if (!address) throw new Error('Select an account or connect your browser wallet first.');
    if (tokenRef.current?.address === address && tokenRef.current.expires > Date.now() + 1000) return tokenRef.current.token;
    if (pendingAuth.current?.address === address) return pendingAuth.current.promise;
    const authenticate = async () => {
      setAuthBusy(true);
      try {
        const registry = await getWriteContract();
        const challenge = await apiRequest('/api/auth/challenge', { method: 'POST', body: { address } });
        const signature = await registry.runner.signMessage(challenge.message);
        const authenticated = await apiRequest('/api/auth/login', { method: 'POST', body: { id: challenge.id, signature } });
        if (activeRef.current !== address) throw new Error('The acting account has changed. Sign in again with the current account.');
        tokenRef.current = authenticated; setSession(authenticated);
        return authenticated.token;
      } finally { setAuthBusy(false); pendingAuth.current = null; }
    };
    const promise = authenticate();
    pendingAuth.current = { address, promise };
    return promise;
  }

  async function fundWallet() {
    try {
      const token = await ensureSession();
      await apiRequest('/api/wallet/fund', { method: 'POST', body: {} }, token);
      await refreshLedger();
      setNotice({ kind: 'success', message: 'Local test funds are ready. No real funds are involved. You can now ask the administrator to authorise your address.' });
    } catch (error) { setNotice({ kind: 'error', message: error.message }); }
  }

  useEffect(() => {
    let disposed = false;
    let provider;
    (async () => {
      try {
        const response = await fetch(`/deployment.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('No deployment was found. Please run the project launch script.');
        const deployment = await response.json();
        const url = new URL(deployment.rpcUrl);
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || deployment.chainId !== 31337) throw new Error('This prototype only connects to a local test chain.');
        provider = new JsonRpcProvider(deployment.rpcUrl, undefined, { cacheTimeout: -1 });
        provider.pollingInterval = 300;
        const network = await provider.getNetwork();
        const code = await provider.getCode(deployment.contractAddress);
        if (Number(network.chainId) !== deployment.chainId || code === '0x' || keccak256(code) !== deployment.codeHash) {
          throw new Error('The deployment configuration does not match the current test chain. Please restart the project.');
        }
        if (!disposed) { setConfig(deployment); setRpc(provider); setConnected(true); setConnectionError(''); }
      } catch (error) { if (!disposed) { setConnected(false); setConnectionError(explainError(error)); } }
    })();
    return () => { disposed = true; provider?.destroy(); };
  }, [refresh]);

  async function refreshLedger() {
    if (!config || !rpc) return;
    const registry = new Contract(config.contractAddress, config.abi, rpc);
    await assertDeployment(registry, config);
    const [issued, revoked, history, profiles, issuerRole] = await Promise.all([
      registry.totalIssued(), registry.totalRevoked(),
      apiRequest('/api/events'), apiRequest('/api/profiles'), registry.ISSUER_ROLE(),
    ]);
    setStats({ issued: Number(issued), revoked: Number(revoked) });
    setIssuers(profiles);
    setEvents(history.slice(0, 6).map(event => ({ transactionHash: event.tx_hash, index: event.log_index,
      blockNumber: event.block_number, kind: event.kind, args: { credentialId: event.credential_id, issuer: event.issuer } })));
    if (activeAddress && isAddress(activeAddress)) {
      const [admin, issuer] = await Promise.all([registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), activeAddress), registry.hasRole(issuerRole, activeAddress)]);
      setRoles({ admin, issuer });
      setBalance(formatEther(await rpc.getBalance(activeAddress)));
    } else setRoles({ admin: false, issuer: false });
  }

  useEffect(() => {
    let stopped = false;
    const update = () => refreshLedger().then(() => { if (!stopped) { setConnected(true); setConnectionError(''); } }).catch(error => {
      if (!stopped) { setConnected(false); setConnectionError(explainError(error)); }
    });
    if (config && rpc) { update(); const timer = setInterval(update, 5000); return () => { stopped = true; clearInterval(timer); }; }
  }, [config, rpc, activeAddress]);

  useEffect(() => {
    if (!window.ethereum) return;
    const accountsChanged = accounts => { tokenRef.current = null; setSession(null); setWalletAddress(accounts[0] || ''); setNotice(null); };
    const chainChanged = () => { walletProvider.current?.destroy(); walletProvider.current = null; setWalletAddress(''); setNotice({ kind: 'error', message: 'The wallet network has changed. Please reconnect to the local test chain.' }); };
    window.ethereum.on('accountsChanged', accountsChanged);
    window.ethereum.on('chainChanged', chainChanged);
    return () => { window.ethereum.removeListener('accountsChanged', accountsChanged); window.ethereum.removeListener('chainChanged', chainChanged); };
  }, []);

  async function connectWallet() {
    if (!window.ethereum) { setNotice({ kind: 'error', message: 'No browser wallet was detected. Use the classroom demo accounts, or install MetaMask and connect.' }); return; }
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0x7a69') {
        try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7a69' }] }); }
        catch (error) {
          if (error.code !== 4902) throw error;
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7a69', chainName: 'VeriLedger Local', rpcUrls: [config.rpcUrl], nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 } }] });
        }
      }
      walletProvider.current?.destroy();
      walletProvider.current = new BrowserProvider(window.ethereum);
      setWalletAddress(await (await walletProvider.current.getSigner()).getAddress());
      setMode('wallet'); setNotice(null);
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
  }

  async function getWriteContract() {
    if (!connected || !config || !rpc) throw new Error('Please connect to the local test chain first.');
    let signer;
    if (mode === 'demo') {
      if (Number((await rpc.getNetwork()).chainId) !== 31337) throw new Error('Demo accounts can only be used on the local test chain.');
      signer = await rpc.getSigner(activeAddress);
    } else {
      if (!walletProvider.current || !walletAddress) throw new Error('Please connect your browser wallet first.');
      if (await window.ethereum.request({ method: 'eth_chainId' }) !== '0x7a69') throw new Error('Please switch your wallet to local test chain 31337.');
      signer = await walletProvider.current.getSigner();
    }
    const registry = new Contract(config.contractAddress, config.abi, signer);
    await assertDeployment(registry, config);
    return registry;
  }

  async function transact(message, operation, after) {
    if (busy) return;
    setBusy(true); setNotice({ kind: 'pending', message: mode === 'wallet' ? 'Please confirm in your wallet…' : 'Submitting to the local test chain…' });
    try {
      const registry = await getWriteContract();
      let tx;
      try { tx = await operation(registry); }
      catch (error) {
        const data = error.data ?? error.info?.error?.data?.data ?? error.info?.error?.data;
        if (!error.revert && typeof data === 'string') {
          try { error.revert = registry.interface.parseError(data); } catch { /* Unknown RPC error. */ }
        }
        throw error;
      }
      setNotice({ kind: 'pending', message: 'Transaction submitted. Waiting for confirmation…', hash: tx.hash });
      const receipt = await tx.wait();
      if (after) await after(receipt);
      setNotice({ kind: 'success', message, hash: receipt.hash });
      // Preserve the successful receipt and exportable salt even if refreshing the list fails.
      try { await refreshLedger(); } catch (error) { setConnectionError(explainError(error)); setConnected(false); }
      return receipt;
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
    finally { setBusy(false); }
  }

  const common = { config, rpc, connected, busy: busy || authBusy, transact, activeAddress, setNotice, lastIssued, setLastIssued,
    apiRequest, ensureSession, session, roles, issuers, refreshLedger, downloadJson, setTab, CopyValue };
  const CurrentIcon = NAV.find(item => item.id === tab).icon;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setTab('verify'); }}><div className="brand-mark"><ShieldCheck size={25}/></div><span>VeriLedger<small>CREDENTIAL REGISTRY</small></span></a>
      <div className="sidebar-section">Workspace <span>FTEC5520</span></div>
      <nav aria-label="Main navigation">{NAV.map(({ id, label, en, icon: Icon }) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setNotice(null); }}><Icon size={21}/><span>{label}<small>{en}</small></span></button>)}</nav>
      <div className="sidebar-bottom"><div className="course"><Layers3 size={19}/><span>FTEC5520<small>Applied Blockchain &<br/>Cryptocurrencies</small></span></div><div className="prototype-label"><FlaskConical size={14}/>Version 2 · Persistent records</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Credential registry <span>/</span> {NAV.find(item => item.id === tab).label}</div><div className={`network-pill ${connected ? 'online' : ''}`}><span className="status-dot"/>{connected ? 'Local test chain connected' : 'Connecting to test chain'}<span className="network-id">31337</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">TRUST, WITH A RECORD.</div><h1>{PAGE_COPY[tab][0]}</h1><p>{PAGE_COPY[tab][1]}</p></div><div className="heading-seal"><CurrentIcon size={32}/></div></div>
        {!connected && connectionError && <div className="connection-error" role="alert"><AlertTriangle size={20}/><span>{connectionError}</span><button className="button secondary small" onClick={() => { setRpc(null); setConfig(null); setRefresh(value => value + 1); }}><RefreshCw size={14}/>Reconnect</button></div>}
        <div className="stats-grid"><Stat label="Registered credentials" value={stats.issued} icon={FileText} detail="REGISTERED"/><Stat label="Unrevoked records" value={stats.issued - stats.revoked} icon={ShieldCheck} detail="NOT REVOKED"/><Stat label="Revoked credentials" value={stats.revoked} icon={Ban} detail="REVOKED"/></div>
        {!['verify', 'help'].includes(tab) && <section className="account-bar" aria-label="Acting account"><div className="account-title"><Wallet size={20}/><div><strong>Acting account</strong><small>{mode === 'demo' ? 'Local test account · Transactions written to the test chain' : 'Sign transactions with your browser wallet'}</small></div></div><div className="account-controls"><div className="segmented"><button className={mode === 'demo' ? 'selected' : ''} disabled={busy} onClick={() => { setMode('demo'); setNotice(null); }}>Classroom demo</button><button className={mode === 'wallet' ? 'selected' : ''} disabled={busy || !config} onClick={connectWallet}>Browser wallet</button></div>{mode === 'demo' ? <div className="select-wrap"><select aria-label="Select acting account" disabled={busy} value={accountIndex} onChange={event => { setAccountIndex(Number(event.target.value)); setNotice(null); }}>{config?.demoAccounts.map((account, index) => <option key={account.address} value={index}>{account.label} · {short(account.address)}</option>)}</select><ChevronDown size={14}/></div> : <button className="button secondary small" disabled={busy || !config} onClick={connectWallet}><Wallet size={15}/>{walletAddress ? short(walletAddress) : 'Connect wallet'}</button>}<span className={`role-chip ${roles.admin || roles.issuer ? 'authorised' : ''}`}>{roles.admin ? 'Administrator' : roles.issuer ? 'Authorised issuer' : 'No issuance permission'}</span></div></section>}
        {!['verify', 'help'].includes(tab) && <div className="wallet-session"><div><strong>{session ? 'Signed in to local records' : 'Not signed in to local records'}</strong><span>{mode === 'wallet' ? `Balance ${Number(balance).toFixed(4)} test ETH · ` : ''}Sign-in is gas-free. Registration and revocation are on-chain transactions.</span></div><div className="wallet-session-actions"><button className="button secondary small" disabled={!connected || busy || authBusy || !activeAddress} onClick={async () => { try { await ensureSession(); } catch (error) { setNotice({ kind: 'error', message: error.message }); } }}>{authBusy ? 'Waiting for signature…' : session ? 'Signed in with this account' : 'Sign in to local records'}</button>{mode === 'wallet' && <button className="button secondary small" disabled={!connected || busy || authBusy || !walletAddress} onClick={fundWallet}>Get local test funds</button>}{activeAddress && <CopyValue value={activeAddress} label="current wallet address" compact/>}</div></div>}
        {tab === 'verify' && <div className="first-use"><BookOpen size={17}/><span>First time here? Start with a sample. Demo accounts work without a browser wallet.</span><button className="text-button" onClick={() => setTab('help')}>Read the beginner guide</button></div>}
        <TransactionNotice notice={notice} onClose={() => setNotice(null)}/>
        <div className="workspace-grid"><div className="workspace-primary">{tab === 'verify' ? <Verifier {...common}/> : tab === 'issue' ? <Issuer {...common}/> : tab === 'documents' ? <Documents {...common}/> : tab === 'help' ? <BeginnerGuide {...common}/> : <Administrator {...common}/>}</div><aside className="workspace-aside"><SamplePanel config={config}/><section className="panel activity-panel"><div className="panel-heading"><h2><Activity size={18}/>On-chain activity</h2><span className="muted">Latest 6</span></div>{events.length ? <div className="event-list">{events.map(event => <div className="event" key={`${event.transactionHash}-${event.index}`}><div className={`event-icon ${event.kind}`} >{event.kind === 'issued' ? <FileCheck2 size={17}/> : <Ban size={17}/>}</div><div><strong>{event.kind === 'issued' ? 'Credential registered' : 'Credential revoked'}</strong><CopyValue value={event.args.credentialId} label="Credential ID" compact/><small>Block #{event.blockNumber} · {short(event.args.issuer)}</small><details><summary>Transaction details</summary><CopyValue value={event.transactionHash} label="transaction hash" compact/></details></div></div>)}</div> : <div className="empty-events">{connected ? 'No registrations yet' : 'Connect to view on-chain records'}</div>}</section><div className="privacy-note"><LockKeyhole size={18}/><p>PDFs and personal information stay off-chain. Only commitments, issuer addresses and status are recorded on-chain.</p></div></aside></div>
        <footer><span>VeriLedger · Internship & Training Credentials</span><span>Verifies file integrity and status, not the truth of the underlying experience.</span></footer>
      </main>
    </div>
  </div>;
}

function Stat({ label, value, icon: Icon, detail }) {
  return <div className="stat"><div className="stat-icon"><Icon size={21}/></div><div><span>{label}</span><strong>{value.toString().padStart(2, '0')}</strong></div><small>{detail}</small></div>;
}

function SamplePanel({ config }) {
  return <section className="panel sample-panel"><div className="sample-heading"><FlaskConical size={19}/><span>Classroom samples</span></div><p>Use fictional credentials to see how file changes and revocation affect verification.</p><a href="/samples/certificate-original.pdf" download className="sample-link"><FileText size={17}/><span>Original certificate PDF</span><Download size={15}/></a><a href="/samples/certificate-altered.pdf" download className="sample-link"><FileText size={17}/><span>PDF with altered dates</span><Download size={15}/></a>{config?.samples.map(sample => <a className="sample-link" key={sample.slug} href={sample.verificationPath} download><FileCheck2 size={17}/><span>{sample.label} · Verification package</span><Download size={15}/></a>)}<div className="sample-footnote">Normal launches keep your records and samples. Reset only when you want a new environment.</div></section>;
}

function Verifier({ config, rpc, connected, busy, setNotice, issuers }) {
  const [file, setFile] = useState(null);
  const [credentialId, setCredentialId] = useState('');
  const [salt, setSalt] = useState('');
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [packageBinding, setPackageBinding] = useState(null);
  const packageInput = useRef(null);
  const clear = () => setResult(null);

  async function importPackage(event) {
    const uploaded = event.target.files[0]; event.target.value = '';
    if (!uploaded) return;
    clear();
    try {
      if (uploaded.size > 32 * 1024) throw new Error('The verification file is too large. Select the JSON exported at registration.');
      const pkg = parseVerificationPackage(await uploaded.text(), config);
      setCredentialId(pkg.credentialId); setSalt(pkg.salt); setPackageName(uploaded.name); setPackageBinding(pkg);
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
  }

  async function useSample(slug) {
    if (!config) return;
    clear(); setChecking(true);
    try {
      const [pdfResponse, packageResponse] = await Promise.all([fetch('/samples/certificate-original.pdf'), fetch(`/samples/${slug}.json`, { cache: 'no-store' })]);
      if (!pdfResponse.ok || !packageResponse.ok) throw new Error('Could not load the sample files.');
      const pkg = parseVerificationPackage(await packageResponse.json(), config);
      setFile(new File([await pdfResponse.arrayBuffer()], 'certificate-original.pdf', { type: 'application/pdf' }));
      setCredentialId(pkg.credentialId); setSalt(pkg.salt); setPackageName(`${slug}.json`); setPackageBinding(pkg);
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
    finally { setChecking(false); }
  }

  async function verify(event) {
    event.preventDefault(); clear(); setChecking(true); setNotice(null);
    try {
      if (!file) throw new Error('Please select a credential PDF first.');
      assertBytes32(credentialId.trim(), 'Credential ID'); assertBytes32(salt.trim(), 'Salt');
      if (packageBinding) parseVerificationPackage(packageBinding, config);
      const fileHash = hashDocument(await file.arrayBuffer());
      const commitment = computeCommitment(fileHash, salt.trim());
      const registry = new Contract(config.contractAddress, config.abi, rpc);
      await assertDeployment(registry, config);
      const [status, record] = await Promise.all([registry.verifyCredential(credentialId.trim(), commitment), registry.getCredential(credentialId.trim())]);
      setResult({ status: STATUS[Number(status)], record, fileHash, commitment, credentialId: credentialId.trim(), profile: issuers.find(issuer => issuer.address.toLowerCase() === record.issuer.toLowerCase()) });
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
    finally { setChecking(false); }
  }

  const disabled = checking || busy;
  return <><section className="panel verify-panel"><div className="panel-heading"><div><h2>Verify credential</h2><p>Select the PDF and import the verification package supplied by its holder.</p></div><span className="tag"><LockKeyhole size={13}/>No wallet needed</span></div><form onSubmit={verify}><Dropzone file={file} disabled={disabled} onFile={value => { setFile(value); clear(); }}/><div className="field-group"><div className="field-label"><label htmlFor="credential-id">Verification package</label><button className="text-button" type="button" disabled={!connected || disabled} onClick={() => packageInput.current.click()}><Upload size={14}/>Import JSON</button></div><input ref={packageInput} type="file" accept=".json,application/json" aria-label="Import verification package" className="visually-hidden" onChange={importPackage} disabled={disabled}/>{packageName && <div className="package-loaded"><Check size={14}/>{packageName} imported</div>}<label className="input-label" htmlFor="credential-id">Credential ID</label><input id="credential-id" className="mono" placeholder="0x…" value={credentialId} disabled={disabled} onChange={event => { setCredentialId(event.target.value); setPackageName(''); setPackageBinding(null); clear(); }} required/><label className="input-label" htmlFor="verification-salt">Verification salt</label><input id="verification-salt" className="mono" placeholder="Import a verification package, or paste the original salt" value={salt} disabled={disabled} onChange={event => { setSalt(event.target.value); setPackageName(''); setPackageBinding(null); clear(); }} required/></div><button className="button primary full" type="submit" disabled={!connected || disabled}>{checking ? <LoaderCircle className="spin" size={19}/> : <ShieldCheck size={19}/>}{checking ? 'Checking the on-chain record…' : 'Verify credential'}</button><div className="inline-help"><span>Try a sample</span><button type="button" className="text-button" disabled={!connected || disabled} onClick={() => useSample('active')}>Load valid sample</button><span>·</span><button type="button" className="text-button" disabled={!connected || disabled} onClick={() => useSample('revoked')}>Load revoked sample</button></div></form></section>{result && <VerificationResult result={result}/>}</>;
}

function VerificationResult({ result }) {
  const { title, text, icon: Icon, theme } = RESULTS[result.status];
  return <section className={`panel result-panel ${theme}`} role="status" aria-label="Verification result"><div className="result-top"><div className="result-symbol"><Icon size={28}/></div><div><span className="result-code">{result.status}</span><h2>{title}</h2></div></div><p>{text}</p>{result.record.exists && <dl className="record-details"><div><dt>Organisation name</dt><dd>{result.profile?.name || 'Organisation name not registered'}</dd></div><div><dt>Name source</dt><dd>{result.profile?.source === 'administrator' ? 'Recorded by administrator (off-chain)' : result.profile?.source === 'classroom-sample' ? 'Preloaded classroom sample' : 'Not provided'}</dd></div><div><dt>Issuer address</dt><dd><CopyValue value={result.record.issuer} label="issuer address" compact/></dd></div><div><dt>Registered at</dt><dd>{date(result.record.issuedAt)}</dd></div>{result.status === 'REVOKED' && <div><dt>Revoked at</dt><dd>{date(result.record.revokedAt)}</dd></div>}</dl>}<details className="technical-details"><summary>View fingerprints and on-chain record</summary><dl><dt>Credential ID</dt><dd><CopyValue value={result.credentialId} label="Credential ID"/></dd><dt>File Keccak-256</dt><dd><CopyValue value={result.fileHash} label="file hash"/></dd><dt>Computed commitment</dt><dd><CopyValue value={result.commitment} label="computed commitment"/></dd>{result.record.exists && <><dt>On-chain commitment</dt><dd><CopyValue value={result.record.commitment} label="On-chain commitment"/></dd></>}</dl></details><div className="result-limit">This result checks the file and revocation status. It does not prove that the internship or training took place.</div></section>;
}

function Issuer({ config, connected, busy, transact, setNotice, lastIssued, setLastIssued, ensureSession, apiRequest, rpc, issuers }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [revokeId, setRevokeId] = useState('');

  async function prepare(value) {
    setFile(value); setTitle(current => current || value.name.replace(/\.pdf$/i, '')); setPrepared(null); setPreparing(true);
    try {
      const fileHash = hashDocument(await value.arrayBuffer());
      const salt = newSalt();
      setPrepared({ credentialId: newCredentialId(), salt, fileHash, commitment: computeCommitment(fileHash, salt) });
    } catch (error) { setNotice({ kind: 'error', message: explainError(error) }); }
    finally { setPreparing(false); }
  }
  async function issue(event) {
    event.preventDefault(); if (!prepared) return;
    setSaving(true);
    try {
      const token = await ensureSession();
      const verification = createVerificationPackage({ ...config, ...prepared });
      await apiRequest('/api/vault', { method: 'POST', body: { verification, commitment: prepared.commitment, title, filename: file.name } }, token);
      await transact('Credential registered. Verification data is backed up. Download it and share it with the original PDF.', registry => registry.issueCredential(prepared.credentialId, prepared.commitment), () => {
        setLastIssued(verification); setPrepared(null); setFile(null); setTitle('');
      });
    } catch (error) { setNotice({ kind: 'error', message: error.message }); }
    finally { setSaving(false); }

  }
  return <><section className="panel"><div className="panel-heading"><div><h2>Register a credential</h2><p>Generate a unique ID and random salt. Only the commitment is written on-chain.</p></div><span className="tag">ISSUER</span></div><form onSubmit={issue}><label className="input-label" htmlFor="certificate-title">Credential title (visible only to the issuer or administrator)</label><input id="certificate-title" value={title} maxLength={120} required placeholder="For example: Summer 2026 training certificate" disabled={busy || saving} onChange={event => setTitle(event.target.value)}/><Dropzone file={file} onFile={prepare} disabled={busy || preparing || saving}/>{prepared && <dl className="prepared-record"><dt>New credential ID</dt><dd><CopyValue value={prepared.credentialId} label="New credential ID"/></dd><dt>Commitment to register</dt><dd><CopyValue value={prepared.commitment} label="commitment"/></dd></dl>}<button type="submit" className="button primary full" disabled={!connected || busy || preparing || saving || !prepared || !title.trim()}>{preparing ? <LoaderCircle className="spin" size={18}/> : <FileCheck2 size={18}/>}{preparing ? 'Computing the document fingerprint…' : saving ? 'Backing up and registering…' : 'Register on-chain'}</button></form><p className="form-footnote">Issuer permission is enforced by the contract. Unauthorised registrations are rejected.</p></section>{lastIssued && <section className="panel issued-success" role="status"><div className="panel-heading"><h2><CircleCheck size={19}/>Credential registered</h2></div><p>Save this verification package. Verification requires it together with the original PDF.</p><CopyValue value={lastIssued.credentialId} label="Registered credential ID"/><button className="button primary full" onClick={() => downloadJson(lastIssued, `verification-${lastIssued.credentialId.slice(2, 10)}.json`)}><Download size={18}/>Download verification JSON</button></section>}<RevocationForm config={config} rpc={rpc} issuers={issuers} connected={connected} busy={busy || saving} transact={transact} credentialId={revokeId} setCredentialId={setRevokeId}/></>;
}

function RevocationForm({ config, rpc, issuers = [], connected, busy, transact, credentialId, setCredentialId }) {
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let cancelled = false; setPreview(null);
    if (config && rpc && /^0x[0-9a-fA-F]{64}$/.test(credentialId)) {
      new Contract(config.contractAddress, config.abi, rpc).getCredential(credentialId).then(record => { if (!cancelled) setPreview(record); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [credentialId, config, rpc]);
  return <section className="panel revoke-panel"><div className="panel-heading"><div><h2>Revoke a credential</h2><p>Only the original issuer or an administrator can revoke. The historical record is retained.</p></div><Ban size={22}/></div><form onSubmit={async event => {
    event.preventDefault();
    if (!confirmed) return;
    try { assertBytes32(credentialId.trim(), 'Credential ID'); }
    catch { return; }
    const receipt = await transact('Credential revoked. Subsequent checks will report the revoked status.', registry => registry.revokeCredential(credentialId.trim()));
    if (receipt) { setCredentialId(''); setConfirmed(false); }
  }}><label className="input-label" htmlFor="revoke-id">Credential ID to revoke</label><input id="revoke-id" className="mono" placeholder="0x…" pattern="0x[0-9a-fA-F]{64}" title="Enter a credential ID: 0x followed by 64 hexadecimal characters" value={credentialId} onChange={event => { setCredentialId(event.target.value); setConfirmed(false); }} disabled={busy} required/>{preview && <div className="revoke-preview">{preview.exists ? <><strong>Check the record before revoking</strong><span>Issuer: {issuers.find(item => item.address.toLowerCase() === preview.issuer.toLowerCase())?.name || preview.issuer}</span><span>Registered at: {date(preview.issuedAt)}</span><span>Current status: {preview.revoked ? 'Revoked' : 'Not revoked'}</span></> : <span>This credential ID is not registered in the current deployment.</span>}</div>}<label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy}/>I confirm this revocation. This prototype does not support reinstatement.</label><button type="submit" className="button danger" disabled={!connected || busy || !confirmed || !credentialId}><Ban size={16}/>Confirm revocation</button></form></section>;
}

function Administrator(props) {
  const [revokeId, setRevokeId] = useState('');
  return <><Profiles {...props}/><RevocationForm {...props} credentialId={revokeId} setCredentialId={setRevokeId}/></>;
}

createRoot(document.getElementById('root')).render(<App/>);
