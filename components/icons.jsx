export function UserIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}
export function BriefcaseIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}
export function PinIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}
export function CheckIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
export function CloseIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
export function GridIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

// bolo de aniversário — colorido (chama, vela, cobertura, massa e prato)
export function CakeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="3.1" r="1.15" fill="#f59e0b" />
      <rect x="11.5" y="4" width="1" height="3" rx="0.5" fill="#38bdf8" />
      <path d="M5 11.2c0-1.15.95-2.1 2.1-2.1h9.8c1.15 0 2.1.95 2.1 2.1V13H5v-1.8z" fill="#f472b6" />
      <rect x="4" y="13" width="16" height="6.2" rx="1.6" fill="#a78bfa" />
      <circle cx="8.5" cy="16" r="0.7" fill="#fde68a" />
      <circle cx="12" cy="16.6" r="0.7" fill="#fde68a" />
      <circle cx="15.5" cy="16" r="0.7" fill="#fde68a" />
      <rect x="3" y="19.6" width="18" height="1.8" rx="0.9" fill="#cbd5e1" />
    </svg>
  );
}

// prédio (sede/Rossi)
export function BuildingIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="4" y="3" width="12" height="18" rx="1.5" />
      <path d="M16 8h4v13H4" />
      <path d="M7.5 6.5h1.5M11 6.5h1.5M7.5 10h1.5M11 10h1.5M7.5 13.5h1.5M11 13.5h1.5" strokeLinecap="round" />
      <path d="M9.5 21v-3.5h1.5V21" />
    </svg>
  );
}

// grupo de pessoas (demais colaboradores)
export function UsersIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.4c2.2.5 3.9 2.1 3.9 4.6" />
    </svg>
  );
}

// organograma: um nó no topo ligado a dois abaixo (hierarquia)
export function OrgIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="9" y="2.5" width="6" height="5" rx="1.3" />
      <rect x="2.5" y="16.5" width="6" height="5" rx="1.3" />
      <rect x="15.5" y="16.5" width="6" height="5" rx="1.3" />
      <path d="M12 7.5v4M5.5 16.5v-2.5h13v2.5" />
    </svg>
  );
}
export function ChevronIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
export function SearchIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}
export function FullscreenIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
export function PlusIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function MinusIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  );
}
export function TargetIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}
export function UploadIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
export function InboxIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
export function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
export function MergeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v6a5 5 0 0 0 5 5h5" />
      <path d="M17 4v6a5 5 0 0 1-5 5H7" />
      <path d="M14 12l3 3-3 3" />
    </svg>
  );
}
export function DownloadIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
export function AlertIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
export function MailIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
export function KeyIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3" />
      <path d="M16 7l3 3" />
      <path d="M13.5 9.5l2.5 2.5" />
    </svg>
  );
}
export function LogoutIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/* ===== ícones de papel no avatar do organograma (cor #ff6000 via CSS) ===== */
// líder com pessoas abaixo na hierarquia
export function CrownIcon({ size = 25 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M18.9999 20.25C19.4142 20.25 19.7499 20.5858 19.7499 21C19.7499 21.4142 19.4142 21.75 18.9999 21.75H4.99995C4.58573 21.75 4.24995 21.4142 4.24995 21C4.24995 20.5858 4.58573 20.25 4.99995 20.25H18.9999ZM11.9999 2.25C12.6979 2.25002 13.1487 2.72063 13.4589 3.16797C13.773 3.62085 14.0964 4.27689 14.4794 5.04785L15.5869 7.27734C15.8485 7.80395 16.0118 8.12848 16.1582 8.34375C16.2265 8.44429 16.2713 8.49094 16.2949 8.51074C16.3009 8.51578 16.3054 8.51811 16.3076 8.51953C16.3127 8.52077 16.318 8.52154 16.3232 8.52246C16.3238 8.52254 16.3291 8.52282 16.3398 8.51953C16.3686 8.51065 16.4272 8.48636 16.5283 8.4209C16.7458 8.27995 17.0214 8.04452 17.4658 7.66113C18.4651 6.79903 19.2683 6.10439 19.8994 5.67871C20.2149 5.46588 20.5408 5.28216 20.8681 5.18945C21.1718 5.10349 21.515 5.08689 21.8476 5.22656L21.9892 5.2959L22.0917 5.35938C22.1249 5.38126 22.1578 5.40462 22.1894 5.42871C22.5313 5.68959 22.681 6.05696 22.7294 6.41309C22.7753 6.75039 22.739 7.12382 22.6708 7.5C22.5347 8.25148 22.2219 9.26817 21.8349 10.5342L20.6689 14.3467C20.4624 15.022 20.2906 15.5906 20.0966 16.0352C19.895 16.4972 19.6405 16.8985 19.2294 17.2041C18.818 17.5099 18.3609 17.637 17.8613 17.6953C17.3813 17.7513 16.7904 17.75 16.0888 17.75H7.91108C7.20951 17.75 6.61859 17.7513 6.13862 17.6953C5.63899 17.637 5.18193 17.5099 4.77046 17.2041C4.35938 16.8985 4.10491 16.4972 3.90327 16.0352C3.70935 15.5908 3.53738 15.0227 3.331 14.3477L2.16499 10.5342C1.77796 9.26817 1.46518 8.25149 1.32905 7.5C1.26093 7.12382 1.2246 6.75039 1.27046 6.41309C1.31893 6.05695 1.4686 5.68959 1.8105 5.42871L1.90815 5.3584C1.94149 5.33639 1.9759 5.3156 2.01069 5.2959C2.38609 5.08342 2.78393 5.09139 3.13081 5.18945C3.45825 5.28214 3.78486 5.46581 4.10053 5.67871C4.73162 6.10439 5.53483 6.79903 6.53413 7.66113C6.97854 8.04453 7.25412 8.27996 7.47163 8.4209C7.57273 8.48638 7.63129 8.51066 7.6601 8.51953C7.66855 8.52212 7.67377 8.52215 7.67573 8.52246C7.68094 8.52156 7.6862 8.52076 7.69135 8.51953L7.69038 8.52051C7.69101 8.52032 7.69608 8.51824 7.70503 8.51074C7.72864 8.49093 7.77339 8.44426 7.84174 8.34375C7.98809 8.12848 8.15143 7.80394 8.41303 7.27734L9.52046 5.04785C9.90345 4.27689 10.2269 3.62085 10.541 3.16797C10.8512 2.72063 11.3019 2.25 11.9999 2.25ZM11.9999 3.76074C11.9625 3.78836 11.8889 3.85741 11.7744 4.02246C11.5379 4.36346 11.2699 4.89909 10.8642 5.71582L9.75678 7.94434C9.51484 8.43136 9.29976 8.86725 9.08198 9.1875C8.85502 9.5212 8.5462 9.85024 8.0644 9.97266C8.00985 9.98651 7.95402 9.99829 7.89839 10.0068C7.40655 10.0822 6.99379 9.89907 6.65522 9.67969C6.33064 9.46934 5.96428 9.15112 5.55366 8.79688C4.52155 7.90648 3.80038 7.28622 3.26167 6.92285C3.01894 6.75914 2.8565 6.67853 2.75385 6.64355C2.74389 6.75337 2.75231 6.93811 2.80561 7.23242C2.92203 7.87517 3.19991 8.78843 3.59956 10.0957L4.7646 13.9082C4.98124 14.6169 5.12687 15.0876 5.27827 15.4346C5.4219 15.7637 5.54094 15.9077 5.66499 16C5.78868 16.0919 5.95917 16.1639 6.31245 16.2051C6.68559 16.2486 7.17418 16.25 7.91108 16.25H16.0888C16.8257 16.25 17.3143 16.2486 17.6874 16.2051C18.0407 16.1639 18.2112 16.092 18.3349 16C18.459 15.9077 18.578 15.7638 18.7216 15.4346C18.873 15.0876 19.0186 14.6169 19.2353 13.9082L20.4003 10.0957C20.8 8.78843 21.0779 7.87517 21.1943 7.23242C21.2476 6.93803 21.255 6.75336 21.2451 6.64355C21.1424 6.67868 20.9803 6.75959 20.7382 6.92285C20.1995 7.28622 19.4783 7.90647 18.4462 8.79688C18.0356 9.15112 17.6693 9.46933 17.3447 9.67969C17.0061 9.89907 16.5933 10.0822 16.1015 10.0068C16.0459 9.99829 15.9901 9.98651 15.9355 9.97266C15.4537 9.85025 15.1449 9.52121 14.9179 9.1875C14.7001 8.86725 14.4851 8.43135 14.2431 7.94434L13.1357 5.71582C12.73 4.8991 12.462 4.36346 12.2255 4.02246C12.1111 3.85744 12.0374 3.78838 11.9999 3.76074ZM11.9999 11.75C12.5522 11.75 12.9999 12.1977 12.9999 12.75C12.9999 13.3023 12.5522 13.75 11.9999 13.75C11.4477 13.75 10.9999 13.3023 10.9999 12.75C10.9999 12.1977 11.4477 11.75 11.9999 11.75Z" />
    </svg>
  );
}
// líder direto da ÁREA (um por área)
export function AwardIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M12.4355 1.24854C16.7055 1.24854 20.1855 4.72854 20.1855 8.99854C20.1855 11.4785 19.0055 13.6885 17.1855 15.1085V20.5085C17.1855 21.5385 17.1855 22.2885 16.4955 22.6285C16.3255 22.7085 16.1655 22.7485 16.0055 22.7485C15.5055 22.7485 15.0155 22.3885 14.3955 21.9185L13.1855 21.0085C13.1555 20.9862 13.1251 20.9636 13.0947 20.941C12.8118 20.7304 12.5258 20.5176 12.4355 20.5085C12.3453 20.5176 12.0593 20.7304 11.7764 20.941C11.746 20.9636 11.7156 20.9862 11.6855 21.0085L10.4855 21.9085L10.4593 21.9281C9.64307 22.5379 9.05826 22.9748 8.37555 22.6285C7.68555 22.2885 7.68555 21.5385 7.68555 20.5085V15.1085C5.86555 13.6885 4.68555 11.4785 4.68555 8.99854C4.68555 4.72854 8.16555 1.24854 12.4355 1.24854ZM12.4355 2.74854C8.98555 2.74854 6.18555 5.54854 6.18555 8.99854C6.18555 12.4485 8.98555 15.2485 12.4355 15.2485C15.8855 15.2485 18.6855 12.4485 18.6855 8.99854C18.6855 5.54854 15.8855 2.74854 12.4355 2.74854ZM15.6855 20.5186V20.5085V16.0285C14.6955 16.4885 13.5955 16.7485 12.4355 16.7485C11.2755 16.7485 10.1755 16.4885 9.18555 16.0285V20.5186V21.0186C9.23226 20.9835 9.282 20.947 9.333 20.9095C9.41302 20.8507 9.49615 20.7896 9.57555 20.7285L10.7855 19.8185C11.4255 19.3385 11.8555 19.0186 12.4355 19.0186C13.0155 19.0186 13.4455 19.3385 14.0855 19.8185L15.2855 20.7185C15.4255 20.8185 15.5655 20.9185 15.6855 21.0085V20.5186ZM9.39517 11.4285L9.64517 9.74854H9.68517L8.53517 8.54852C8.23517 8.23852 8.13517 7.79855 8.27517 7.38855C8.40517 6.98855 8.74517 6.69854 9.15517 6.62854L10.7252 6.36853L11.4552 4.86853C11.6452 4.47853 12.0352 4.23853 12.4552 4.23853C12.8752 4.23853 13.2652 4.47853 13.4552 4.86853L14.1852 6.36853L15.7552 6.62854C16.1652 6.69854 16.5052 6.98855 16.6352 7.38855C16.7652 7.79855 16.6652 8.23852 16.3752 8.54852L15.2252 9.74854L15.4752 11.4285C15.5352 11.8685 15.3552 12.2885 15.0052 12.5385C14.6652 12.7785 14.2152 12.8085 13.8452 12.6085L12.4352 11.8585L11.0252 12.6085C10.8652 12.6985 10.6852 12.7385 10.5052 12.7385C10.2852 12.7385 10.0552 12.6785 9.86517 12.5385C9.50517 12.2885 9.33517 11.8585 9.39517 11.4285ZM11.9652 7.19855C11.8052 7.52855 11.4952 7.75854 11.1452 7.81854L10.0552 7.99854L10.8552 8.8385C11.0952 9.0885 11.2052 9.44852 11.1552 9.79852L10.9852 10.9285L11.9152 10.4385C12.0752 10.3485 12.2552 10.3085 12.4352 10.3085C12.6152 10.3085 12.7952 10.3485 12.9552 10.4385L13.8852 10.9285L13.7152 9.79852C13.6652 9.44852 13.7752 9.0885 14.0152 8.8385L14.8152 7.99854L13.7252 7.81854C13.3752 7.75854 13.0652 7.52855 12.9052 7.19855L12.4352 6.22852L11.9652 7.19855Z" />
    </svg>
  );
}
// diretor responsável pela área
export function ManagerIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path fill="currentColor" d="M8.5,12.25 C8.796,12.25 9.065,12.425 9.185,12.695 L11.407,17.695 L11.728,15.132 L10.829,13.335 C10.713,13.103 10.725,12.827 10.862,12.606 C10.999,12.385 11.24,12.25 11.5,12.25 L13.5,12.25 C13.76,12.25 14.001,12.385 14.138,12.606 C14.275,12.827 14.287,13.103 14.171,13.335 L13.272,15.132 L13.593,17.695 L15.815,12.695 C15.935,12.425 16.204,12.25 16.5,12.25 L16.555,12.25 C17.452,12.25 18.2,12.25 18.795,12.33 C19.422,12.414 19.989,12.6 20.444,13.056 C20.9,13.511 21.086,14.078 21.17,14.705 C21.25,15.3 21.25,16.048 21.25,16.945 L21.25,22 C21.25,22.414 20.914,22.75 20.5,22.75 C20.086,22.75 19.75,22.414 19.75,22 L19.75,17 C19.75,16.036 19.748,15.388 19.684,14.905 C19.621,14.444 19.514,14.246 19.384,14.116 C19.254,13.986 19.056,13.879 18.595,13.816 C18.198,13.763 17.69,13.753 16.987,13.75 L13.185,22.305 C13.065,22.576 12.796,22.75 12.5,22.75 C12.204,22.75 11.935,22.576 11.815,22.305 L8.013,13.75 C7.31,13.753 6.802,13.763 6.405,13.816 C5.944,13.879 5.746,13.986 5.616,14.116 C5.486,14.246 5.379,14.444 5.317,14.905 C5.252,15.388 5.25,16.036 5.25,17 L5.25,22 C5.25,22.414 4.914,22.75 4.5,22.75 C4.086,22.75 3.75,22.414 3.75,22 L3.75,16.948 C3.75,16.049 3.75,15.3 3.83,14.705 C3.914,14.078 4.1,13.511 4.555,13.056 C5.011,12.6 5.578,12.414 6.206,12.33 C6.8,12.25 7.548,12.25 8.445,12.25 L8.5,12.25 Z M12.5,1.25 C14.847,1.25 16.75,3.153 16.75,5.5 L16.75,6.5 C16.75,8.847 14.847,10.75 12.5,10.75 C10.153,10.75 8.25,8.847 8.25,6.5 L8.25,5.5 C8.25,3.153 10.153,1.25 12.5,1.25 Z M9.75,5.5 L9.75,6.5 C9.75,8.019 10.981,9.25 12.5,9.25 C14.019,9.25 15.25,8.019 15.25,6.5 L15.25,5.5 C15.25,3.981 14.019,2.75 12.5,2.75 C10.981,2.75 9.75,3.981 9.75,5.5 Z" />
    </svg>
  );
}
