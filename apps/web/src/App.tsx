import { GitCompareArrows, Network } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { CapabilityPage } from './pages/CapabilityPage.js';
import { ImpactPage } from './pages/ImpactPage.js';
import { OverviewPage } from './pages/OverviewPage.js';

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/overview" aria-label="WDMCD overview">
          <span className="brand-mark">W</span>
          <span>WDMCD</span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/overview">
            <Network size={17} aria-hidden="true" />
            Overview
          </NavLink>
          <NavLink to="/impact">
            <GitCompareArrows size={17} aria-hidden="true" />
            Impact
          </NavLink>
        </nav>
        <span className="local-indicator">Local model</span>
      </header>
      <Routes>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/capabilities/:id" element={<CapabilityPage />} />
        <Route path="/impact" element={<ImpactPage />} />
        <Route path="*" element={<Navigate replace to="/overview" />} />
      </Routes>
    </div>
  );
}
