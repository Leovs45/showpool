import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import EventDetail from './pages/EventDetail';
import CreateEvent from './pages/CreateEvent';
import './index.css';

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link to="/" className="nav-logo">event<span>flow</span></Link>
        <Link to="/create" className="btn btn-primary btn-sm">+ Crear evento</Link>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/create" element={<CreateEvent />} />
      </Routes>
    </BrowserRouter>
  );
}
