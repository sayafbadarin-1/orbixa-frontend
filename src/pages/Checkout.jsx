import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'

export default function Checkout() {
  const { sku } = useParams()
  const [searchParams] = useSearchParams()
  const price = searchParams.get('price') || 0
  const navigate = useNavigate()
  
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCheckout = (e) => {
    e.preventDefault()
    setLoading(true)
    
    const orderData = {
      customer_name: name,
      whatsapp_number: whatsapp,
      payment_method: "manual_transfer",
      items: [{ sku: sku, price: parseFloat(price), quantity: 1 }],
      total_amount: parseFloat(price)
    }

    axios.post('https://orbixa-backend.onrender.com/api/checkout', orderData)
      .then(res => {
        alert('تم إرسال طلبك بنجاح! سيتم التواصل معك عبر الواتساب.')
        navigate('/')
      })
      .catch(err => {
        alert('حدث خطأ أثناء الطلب')
        setLoading(false)
      })
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', backgroundColor: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      <h2>إتمام الطلب</h2>
      <p>المنتج المطلوب: <strong>{sku}</strong></p>
      <h3 style={{ color: '#10b981' }}>المبلغ الإجمالي: {price} ₪</h3>
      
      <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>الاسم الكريم:</label>
          <input type="text" required value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>رقم الواتساب (مع الرمز الدولي):</label>
          <input type="text" required placeholder="+970..." value={whatsapp} onChange={e => setWhatsapp(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
        </div>
        <button type="submit" disabled={loading} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px', fontSize: '1.1rem' }}>
          {loading ? 'جاري الإرسال...' : 'تأكيد الطلب'}
        </button>
      </form>
    </div>
  )
}
