import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = (e) => {
    e.preventDefault()
    axios.post('https://orbixa-backend.onrender.com/api/admin/login', { username, password })
      .then(res => {
        localStorage.setItem('adminToken', res.data.token) // حفظ التوكن
        navigate('/admin/orders')
      })
      .catch(() => alert('بيانات الدخول غير صحيحة'))
  }

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '30px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>تسجيل دخول الإدارة</h2>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input type="text" placeholder="اسم المستخدم" required value={username} onChange={e => setUsername(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
        <input type="password" placeholder="كلمة المرور" required value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
        <button type="submit" style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>دخول</button>
      </form>
    </div>
  )
}
