import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Checkout from './pages/Checkout'
import AdminLogin from './pages/AdminLogin'
import AdminOrders from './pages/AdminOrders'

function App() {
  return (
    <Router>
      <div dir="rtl" style={{ fontFamily: 'system-ui', backgroundColor: '#f9fafb', minHeight: '100vh', margin: '-8px' }}>
        <nav style={{ padding: '20px', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, color: '#6366f1', fontSize: '1.5rem' }}>متجر Orbixa</h1>
          <div>
            <Link to="/" style={{ margin: '0 10px', textDecoration: 'none', color: '#333', fontWeight: 'bold' }}>الرئيسية</Link>
            <Link to="/admin/login" style={{ margin: '0 10px', textDecoration: 'none', color: '#ef4444', fontWeight: 'bold' }}>الإدارة</Link>
          </div>
        </nav>
        
        <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/checkout/:sku" element={<Checkout />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
