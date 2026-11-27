import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Phone, KeyRound, ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from '../i18n';

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (phone.length === 10) setStep(2);
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    if (otp.length === 4) {
      try {
        localStorage.setItem('fasalnirnay_user', JSON.stringify({ phone, userId: phone }));
      } catch (err) {
        console.error('Failed to save user session:', err);
      }
      navigate('/dashboard');
    }
  };

  const handleDemoLogin = () => {
    try {
      localStorage.setItem('fasalnirnay_user', JSON.stringify({
        phone: '9876543210',
        userId: 'demo_farmer_001',
        name: 'Demo Farmer'
      }));
    } catch (err) {
      console.error('Failed to save demo user session:', err);
    }
    navigate('/analyze');
  };

  return (
    <div className="min-h-screen bg-primary-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Sprout className="h-16 w-16 text-primary-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl md:text-4xl font-extrabold text-surface-900 font-serif">
          {t('brand.name')}
        </h2>
        <p className="mt-2 text-center text-lg text-surface-600">
          {t('brand.tagline')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-primary-900/5 sm:rounded-2xl sm:px-10 border border-primary-100">
          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label htmlFor="phone" className="block text-lg font-medium text-surface-700">
                  {t('auth.mobileNumber')}
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-6 w-6 text-surface-400" />
                  </div>
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    className="form-input pl-11 text-lg py-3"
                    placeholder={t('auth.enterNumber')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    maxLength="10"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-lg font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 cursor-pointer"
                disabled={phone.length !== 10}
              >
                {t('auth.getOtp')} <ArrowRight className="ml-2 h-6 w-6" />
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white text-surface-400 font-bold uppercase tracking-wider">
                    मूल्यांकन के लिए / Evaluator Access
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-extrabold text-base md:text-lg shadow-sm transition-all cursor-pointer"
              >
                <Sparkles className="h-5 w-5 text-amber-500" />
                <span>Demo Farmer Login (Instant Access)</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6 animate-fade-in">
              <div>
                <label htmlFor="otp" className="block text-lg font-medium text-surface-700">
                  {t('auth.enterOtp')} +91 {phone}
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-6 w-6 text-surface-400" />
                  </div>
                  <input
                    type="text"
                    name="otp"
                    id="otp"
                    className="form-input pl-11 text-lg py-3 tracking-[1em] font-bold text-center"
                    placeholder="••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    maxLength="4"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-lg font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                disabled={otp.length !== 4}
              >
                {t('auth.verifyLogin')}
              </button>
              
              <div className="text-center mt-4">
                <button 
                  type="button" 
                  onClick={() => setStep(1)}
                  className="text-primary-600 hover:text-primary-800 text-base font-medium"
                >
                  {t('auth.changeNumber')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
