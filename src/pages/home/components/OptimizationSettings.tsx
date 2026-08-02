import { useState } from 'react';

export interface Settings {
  keywordMatch: boolean;
  model: string;
}

export const AI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', desc: '速度与质量均衡，日常优化首选', badge: '热门' },
  { id: 'gpt-3.5', name: 'GPT-3.5', desc: '响应速度快，基础优化够用', badge: '推荐' },
  { id: 'gpt-4', name: 'GPT-4', desc: '最强推理能力，适合复杂岗位分析', badge: '需配置' },
  { id: 'claude-3', name: 'Claude 3', desc: '擅长长文本处理，整份简历优化更连贯', badge: '需配置' },
  { id: 'gemini-pro', name: 'Gemini Pro', desc: '多语言能力强，适合外企岗位', badge: '需配置' },
];

interface OptimizationSettingsProps {
  settings: Settings;
  onChange: (s: Settings) => void;
}

export default function OptimizationSettings({ settings, onChange }: OptimizationSettingsProps) {
  const [showModelPicker, setShowModelPicker] = useState(false);

  const currentModel = AI_MODELS.find((m) => m.id === settings.model) || AI_MODELS[0];

  return (
    <div className="space-y-4">
      {/* 关键词匹配开关 */}
      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg text-amber-600">
            <i className="ri-search-eye-line" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">智能关键词匹配</p>
            <p className="text-xs text-slate-400 mt-0.5">自动提取 JD 关键词并融入简历，提升岗位匹配度</p>
          </div>
        </div>
        <button
          onClick={() => onChange({ ...settings, keywordMatch: !settings.keywordMatch })}
          className={`whitespace-nowrap relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
            settings.keywordMatch ? 'bg-amber-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              settings.keywordMatch ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* AI 模型选择 */}
      <div>
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-amber-300 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg text-slate-600">
              <i className="ri-cpu-line" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-700">AI 模型</p>
              <p className="text-xs text-slate-400 mt-0.5">
                当前使用：
                <span className="text-amber-600 font-medium">{currentModel.name}</span>
                {currentModel.badge && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${currentModel.badge === '需配置' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                    {currentModel.badge}
                  </span>
                )}
              </p>
            </div>
          </div>
          <i className={`ri-arrow-down-s-line text-slate-400 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
        </button>

        {/* 模型列表 */}
        {showModelPicker && (
          <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm shadow-slate-200/50">
            {AI_MODELS.map((model, idx) => (
              <button
                key={model.id}
                onClick={() => {
                  if (model.badge === '需配置') {
                    const ok = window.confirm(
                      `${model.name} 在当前 API 账号下未配置渠道权限，调用时会自动降级到 GPT-4o。\n\n是否仍要选择 ${model.name}？`
                    );
                    if (!ok) return;
                  }
                  onChange({ ...settings, model: model.id });
                  setShowModelPicker(false);
                }}
                className={`w-full text-left p-4 flex items-start gap-3 transition-all cursor-pointer ${
                  settings.model === model.id
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'hover:bg-slate-50'
                } ${idx !== AI_MODELS.length - 1 ? 'border-b border-slate-50' : ''}`}
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {settings.model === model.id ? (
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <i className="ri-check-line text-white text-xs" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{model.name}</span>
                    {model.badge && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${model.badge === '需配置' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{model.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}