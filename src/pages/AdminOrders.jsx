import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const navigate = useNavigate()
  const token = localStorage.getItem('adminToken')

  useEffect(() => {
    if (!token) return navigate('/admin/login')
    fetchOrders()
  }, [])

  const fetchOrders = () => {
    axios.get('https://orbixa-backend.onrender.com/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setOrders(res.data.data))
    .catch(() => {
      alert('انتهت الجلسة، يرجى تسجيل الدخول مجدداً')
      localStorage.removeItem('adminToken')
      navigate('/admin/login')
    })
  }

  const updateStatus = (orderId, newStatus) => {
    axios.put(`https://orbixa-backend.onrender.com/api/admin/orders/${orderId}/status`, { status: newStatus }, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(() => fetchOrders())
    .catch(() => alert('حدث خطأ أثناء التحديث'))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>إدارة الطلبات</h2>
        <button onClick={() => {localStorage.removeItem('adminToken'); navigate('/admin/login')}} style={{ padding: '8px 15px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>تسجيل الخروج</button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {orders.map(order => (
          <div key={order._id} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p><strong>العميل:</strong> {order.customer_name}</p>
              <p><strong>واتساب:</strong> <a href={`https://wa.me/${order.whatsapp_number.replace('+', '')}`} target="_blank" rel="noreferrer" style={{color: '#10b981'}}>{order.whatsapp_number}</a></p>
              <p><strong>المبلغ:</strong> {order.total_amount} ₪</p>
              <p><strong>المنتجات:</strong> {order.items.map(i => i.sku).join(', ')}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select value={order.status} onChange={(e) => updateStatus(order._id, e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}>
                <option value="pending">قيد الانتظار</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">ملغي</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
