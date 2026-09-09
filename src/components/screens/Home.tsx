"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAccessibility } from "@/context/AccessibilityContext";
import { EasyHome } from "@/features/home/EasyHome";
import { HomeHero, HomeNeedsPicker } from "@/features/home/HomeHero";
import { HomeDiscovery } from "@/features/home/HomeDiscovery";
import { HomeOfficialGuide } from "@/features/home/HomeOfficialGuide";
import { HomeRecommendations } from "@/features/home/HomeRecommendations";
import { HomeTravelSupport } from "@/features/home/HomeTravelSupport";
import { HomeWeatherNotice } from "@/features/home/HomeWeatherNotice";
import { homeNeedIdsToChatNeeds } from "@/features/home/homeData";
import { useHomeExperience } from "@/features/home/useHomeExperience";

const Chatbot = dynamic(() => import("@/components/Chatbot"), {
  loading: () => (
    <p
      role="status"
      className="bg-background text-ink fixed right-4 bottom-24 z-50 rounded-xl border p-4 shadow-lg"
    >
      채팅창을 불러오는 중입니다.
    </p>
  )
});
const HomePlaceDialog = dynamic(
  () => import("@/features/home/HomePlaceDialog").then((module) => module.HomePlaceDialog),
  {
    loading: () => (
      <p
        role="status"
        className="bg-background text-ink fixed right-4 bottom-24 z-50 rounded-xl border p-4 shadow-lg"
      >
        장소 정보를 불러오는 중입니다.
      </p>
    )
  }
);

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  const chatTriggerRef = useRef<HTMLElement | null>(null);
  const experience = useHomeExperience();
  const { easyMode, toggleEasyMode } = useAccessibility();

  const openChat = () => {
    chatTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatOpen(false);
    window.requestAnimationFrame(() => {
      if (chatTriggerRef.current?.isConnected) chatTriggerRef.current.focus();
    });
  };

  const sharedDialogs = (
    <>
      {experience.selectedPlace ? (
        <HomePlaceDialog
          place={experience.selectedPlace}
          selectedNeedIds={experience.selectedNeedIds}
          onClose={experience.closePlace}
        />
      ) : null}

      {chatOpen ? (
        <Chatbot
          onClose={closeChat}
          accessibilityNeeds={homeNeedIdsToChatNeeds(experience.selectedNeedIds)}
        />
      ) : null}
    </>
  );

  if (easyMode) {
    return (
      <>
        <EasyHome experience={experience} onOpenChat={openChat} onExitEasyMode={toggleEasyMode} />
        {sharedDialogs}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl overflow-x-hidden pb-24 md:pb-8">
      <div className="space-y-4 sm:space-y-8">
        <HomeHero experience={experience} onOpenChat={openChat} />

        <section
          className="border-hairline overflow-hidden rounded-[1.25rem] border bg-white shadow-[0_18px_44px_-40px_rgba(15,44,41,0.72)]"
          aria-label="나에게 맞춰 보는 장소 추천"
        >
          <HomeNeedsPicker experience={experience} easyMode={easyMode} />
          <HomeRecommendations experience={experience} easyMode={easyMode} />
        </section>

        <HomeTravelSupport />
        <HomeWeatherNotice />
      </div>

      <div className="mt-10 sm:mt-14 lg:mt-16">
        <HomeDiscovery
          festivals={experience.data?.festivals ?? []}
          easyMode={false}
          onOpenFestival={experience.openPlace}
        />
      </div>

      <div className="mt-6 sm:mt-8">
        <HomeOfficialGuide />
      </div>

      {sharedDialogs}
    </div>
  );
}
