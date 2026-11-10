import React, { useEffect, useRef } from 'react';

export const Tooltip: React.FC = () => {
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const tip = tipRef.current;
      if (!tip) return;
      const target = e.target as HTMLElement | null;
      const t = target?.closest?.('[data-tip]') as HTMLElement | null;
      if (!t || !t.dataset.tip) {
        // 차트가 같은 #tip 을 직접 쓰므로, 머리글 설명 모양이 남아 있지 않게 지운다
        tip.classList.remove('desc');
        // Only hide if not hovering inside a chart slice that manages #tip
        if (!target?.closest?.('.chart-slice')) {
          tip.style.opacity = '0';
        }
        return;
      }
      const [h, v] = t.dataset.tip.split('|');
      tip.innerHTML = `<span>${h ?? ''}</span><b>${v ?? ''}</b>`;
      // 표 머리글 설명처럼 문장인 툴팁은 줄바꿈되는 설명 모양으로 보여 준다 (값 툴팁은 큰 숫자 한 줄)
      tip.classList.toggle('desc', t.dataset.tipDesc !== undefined);
      const w = tip.offsetWidth;
      const x = e.clientX + 12 + w > window.innerWidth ? e.clientX - 12 - w : e.clientX + 12;
      tip.style.left = `${x}px`;
      // data-tip-pos="top" 이면 요소 바로 위에 붙인다 (화면 맨 아래 요소는 작업표시줄 등에 가려질 수 있다).
      // 그 밖에는 커서 아래에 띄우고, 화면 아래로 넘치면 커서 위로 올린다
      const tipH = tip.offsetHeight;
      const top =
        t.dataset.tipPos === 'top'
          ? t.getBoundingClientRect().top - 8 - tipH
          : e.clientY + 12 + tipH > window.innerHeight
            ? e.clientY - 12 - tipH
            : e.clientY + 12;
      tip.style.top = `${Math.max(0, top)}px`;
      tip.style.opacity = '1';
    };

    document.addEventListener('pointermove', handlePointerMove);
    return () => document.removeEventListener('pointermove', handlePointerMove);
  }, []);

  return <div className="tip" id="tip" ref={tipRef} />;
};
