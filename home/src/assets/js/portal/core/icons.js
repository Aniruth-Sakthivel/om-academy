/*
Author       : OM Academy
Description  : Icons for the portal, rendered as inline SVG strings (24px grid, stroke="currentColor",
               aria-hidden="true" — same convention as the home page). Uses "lucide"'s icon-node arrays directly
               instead of its DOM helpers, so unused icons are tree-shaken out of the build.
               Only import icons here — importing "lucide" anywhere else risks pulling in the whole icon set.
*/

import House from "lucide/dist/esm/icons/house.mjs";
import LayoutDashboard from "lucide/dist/esm/icons/layout-dashboard.mjs";
import BookOpen from "lucide/dist/esm/icons/book-open.mjs";
import ClipboardList from "lucide/dist/esm/icons/clipboard-list.mjs";
import CalendarCheck from "lucide/dist/esm/icons/calendar-check.mjs";
import GraduationCap from "lucide/dist/esm/icons/graduation-cap.mjs";
import ChartLine from "lucide/dist/esm/icons/chart-line.mjs";
import ChartColumn from "lucide/dist/esm/icons/chart-column.mjs";
import ChartPie from "lucide/dist/esm/icons/chart-pie.mjs";
import FolderOpen from "lucide/dist/esm/icons/folder-open.mjs";
import MessagesSquare from "lucide/dist/esm/icons/messages-square.mjs";
import MessageSquare from "lucide/dist/esm/icons/message-square.mjs";
import CalendarDays from "lucide/dist/esm/icons/calendar-days.mjs";
import Calendar from "lucide/dist/esm/icons/calendar.mjs";
import CalendarClock from "lucide/dist/esm/icons/calendar-clock.mjs";
import CalendarX from "lucide/dist/esm/icons/calendar-x.mjs";
import Wallet from "lucide/dist/esm/icons/wallet.mjs";
import Bell from "lucide/dist/esm/icons/bell.mjs";
import BellRing from "lucide/dist/esm/icons/bell-ring.mjs";
import UserRound from "lucide/dist/esm/icons/user-round.mjs";
import Users from "lucide/dist/esm/icons/users.mjs";
import UserPlus from "lucide/dist/esm/icons/user-plus.mjs";
import UserCheck from "lucide/dist/esm/icons/user-check.mjs";
import UserX from "lucide/dist/esm/icons/user-x.mjs";
import Megaphone from "lucide/dist/esm/icons/megaphone.mjs";
import Settings from "lucide/dist/esm/icons/settings.mjs";
import Search from "lucide/dist/esm/icons/search.mjs";
import Moon from "lucide/dist/esm/icons/moon.mjs";
import Sun from "lucide/dist/esm/icons/sun.mjs";
import Menu from "lucide/dist/esm/icons/menu.mjs";
import PanelLeftClose from "lucide/dist/esm/icons/panel-left-close.mjs";
import PanelLeftOpen from "lucide/dist/esm/icons/panel-left-open.mjs";
import LogOut from "lucide/dist/esm/icons/log-out.mjs";
import LogIn from "lucide/dist/esm/icons/log-in.mjs";
import ChevronRight from "lucide/dist/esm/icons/chevron-right.mjs";
import ChevronLeft from "lucide/dist/esm/icons/chevron-left.mjs";
import ChevronDown from "lucide/dist/esm/icons/chevron-down.mjs";
import ChevronUp from "lucide/dist/esm/icons/chevron-up.mjs";
import EllipsisVertical from "lucide/dist/esm/icons/ellipsis-vertical.mjs";
import Plus from "lucide/dist/esm/icons/plus.mjs";
import Pencil from "lucide/dist/esm/icons/pencil.mjs";
import Trash2 from "lucide/dist/esm/icons/trash-2.mjs";
import Eye from "lucide/dist/esm/icons/eye.mjs";
import Download from "lucide/dist/esm/icons/download.mjs";
import Upload from "lucide/dist/esm/icons/upload.mjs";
import Printer from "lucide/dist/esm/icons/printer.mjs";
import FileText from "lucide/dist/esm/icons/file-text.mjs";
import FileSpreadsheet from "lucide/dist/esm/icons/file-spreadsheet.mjs";
import Presentation from "lucide/dist/esm/icons/presentation.mjs";
import Video from "lucide/dist/esm/icons/video.mjs";
import Link from "lucide/dist/esm/icons/link.mjs";
import X from "lucide/dist/esm/icons/x.mjs";
import Check from "lucide/dist/esm/icons/check.mjs";
import CheckCheck from "lucide/dist/esm/icons/check-check.mjs";
import CircleCheck from "lucide/dist/esm/icons/circle-check.mjs";
import CircleAlert from "lucide/dist/esm/icons/circle-alert.mjs";
import CircleX from "lucide/dist/esm/icons/circle-x.mjs";
import TriangleAlert from "lucide/dist/esm/icons/triangle-alert.mjs";
import Info from "lucide/dist/esm/icons/info.mjs";
import Clock from "lucide/dist/esm/icons/clock.mjs";
import Clock3 from "lucide/dist/esm/icons/clock-3.mjs";
import MapPin from "lucide/dist/esm/icons/map-pin.mjs";
import Phone from "lucide/dist/esm/icons/phone.mjs";
import Mail from "lucide/dist/esm/icons/mail.mjs";
import Send from "lucide/dist/esm/icons/send.mjs";
import Paperclip from "lucide/dist/esm/icons/paperclip.mjs";
import Filter from "lucide/dist/esm/icons/filter.mjs";
import SlidersHorizontal from "lucide/dist/esm/icons/sliders-horizontal.mjs";
import ArrowUpDown from "lucide/dist/esm/icons/arrow-up-down.mjs";
import ArrowUpRight from "lucide/dist/esm/icons/arrow-up-right.mjs";
import ArrowDownRight from "lucide/dist/esm/icons/arrow-down-right.mjs";
import ArrowLeft from "lucide/dist/esm/icons/arrow-left.mjs";
import ArrowRight from "lucide/dist/esm/icons/arrow-right.mjs";
import RefreshCw from "lucide/dist/esm/icons/refresh-cw.mjs";
import RotateCcw from "lucide/dist/esm/icons/rotate-ccw.mjs";
import ShieldCheck from "lucide/dist/esm/icons/shield-check.mjs";
import Lock from "lucide/dist/esm/icons/lock.mjs";
import KeyRound from "lucide/dist/esm/icons/key-round.mjs";
import Receipt from "lucide/dist/esm/icons/receipt.mjs";
import CreditCard from "lucide/dist/esm/icons/credit-card.mjs";
import IndianRupee from "lucide/dist/esm/icons/indian-rupee.mjs";
import Building2 from "lucide/dist/esm/icons/building-2.mjs";
import Award from "lucide/dist/esm/icons/award.mjs";
import Target from "lucide/dist/esm/icons/target.mjs";
import TrendingUp from "lucide/dist/esm/icons/trending-up.mjs";
import TrendingDown from "lucide/dist/esm/icons/trending-down.mjs";
import Pin from "lucide/dist/esm/icons/pin.mjs";
import Heart from "lucide/dist/esm/icons/heart.mjs";
import ThumbsUp from "lucide/dist/esm/icons/thumbs-up.mjs";
import Flag from "lucide/dist/esm/icons/flag.mjs";
import Reply from "lucide/dist/esm/icons/reply.mjs";
import Star from "lucide/dist/esm/icons/star.mjs";
import ListChecks from "lucide/dist/esm/icons/list-checks.mjs";
import NotebookPen from "lucide/dist/esm/icons/notebook-pen.mjs";
import Layers from "lucide/dist/esm/icons/layers.mjs";
import Repeat from "lucide/dist/esm/icons/repeat.mjs";
import Database from "lucide/dist/esm/icons/database.mjs";
import FileDown from "lucide/dist/esm/icons/file-down.mjs";
import FileUp from "lucide/dist/esm/icons/file-up.mjs";
import History from "lucide/dist/esm/icons/history.mjs";
import Activity from "lucide/dist/esm/icons/activity.mjs";
import Smartphone from "lucide/dist/esm/icons/smartphone.mjs";
import Globe from "lucide/dist/esm/icons/globe.mjs";
import Sparkles from "lucide/dist/esm/icons/sparkles.mjs";
import Timer from "lucide/dist/esm/icons/timer.mjs";
import BadgeCheck from "lucide/dist/esm/icons/badge-check.mjs";
import Ban from "lucide/dist/esm/icons/ban.mjs";
import Inbox from "lucide/dist/esm/icons/inbox.mjs";
import SquarePen from "lucide/dist/esm/icons/square-pen.mjs";
import Share2 from "lucide/dist/esm/icons/share-2.mjs";
import Hash from "lucide/dist/esm/icons/hash.mjs";
import LayoutGrid from "lucide/dist/esm/icons/layout-grid.mjs";
import List from "lucide/dist/esm/icons/list.mjs";
import ListFilter from "lucide/dist/esm/icons/list-filter.mjs";
import CirclePlay from "lucide/dist/esm/icons/circle-play.mjs";
import Image from "lucide/dist/esm/icons/image.mjs";
import FileImage from "lucide/dist/esm/icons/file-image.mjs";
import FileAudio from "lucide/dist/esm/icons/file-audio.mjs";
import FileBadge from "lucide/dist/esm/icons/file-badge.mjs";
import School from "lucide/dist/esm/icons/school.mjs";
import Copy from "lucide/dist/esm/icons/copy.mjs";
import ExternalLink from "lucide/dist/esm/icons/external-link.mjs";
import Laptop from "lucide/dist/esm/icons/laptop.mjs";
import Wifi from "lucide/dist/esm/icons/wifi.mjs";
import Save from "lucide/dist/esm/icons/save.mjs";
import LoaderCircle from "lucide/dist/esm/icons/loader-circle.mjs";
import Minus from "lucide/dist/esm/icons/minus.mjs";
import Sheet from "lucide/dist/esm/icons/sheet.mjs";

// Name → icon node. Names are the ones used by nav.js and data-icon attributes across the portal.
export const ICONS = {
  House, LayoutDashboard, BookOpen, ClipboardList, CalendarCheck, GraduationCap, ChartLine, ChartColumn, ChartPie,
  FolderOpen, MessagesSquare, MessageSquare, CalendarDays, Calendar, CalendarClock, CalendarX, Wallet, Bell, BellRing,
  UserRound, Users, UserPlus, UserCheck, UserX, Megaphone, Settings, Search, Moon, Sun, Menu, PanelLeftClose,
  PanelLeftOpen, LogOut, LogIn, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, EllipsisVertical, Plus, Pencil,
  Trash2, Eye, Download, Upload, Printer, FileText, FileSpreadsheet, Presentation, Video, Link, X, Check, CheckCheck,
  CircleCheck, CircleAlert, CircleX, TriangleAlert, Info, Clock, Clock3, MapPin, Phone, Mail, Send, Paperclip, Filter,
  SlidersHorizontal, ArrowUpDown, ArrowUpRight, ArrowDownRight, ArrowLeft, ArrowRight, RefreshCw, RotateCcw,
  ShieldCheck, Lock, KeyRound, Receipt, CreditCard, IndianRupee, Building2, Award, Target, TrendingUp, TrendingDown,
  Pin, Heart, ThumbsUp, Flag, Reply, Star, ListChecks, NotebookPen, Layers, Repeat, Database, FileDown, FileUp,
  History, Activity, Smartphone, Globe, Sparkles, Timer, BadgeCheck, Ban, Inbox, SquarePen, Share2, Hash, LayoutGrid,
  List, ListFilter, CirclePlay, Image, FileImage, FileAudio, FileBadge, School, Copy, ExternalLink, Laptop, Wifi,
  Save, LoaderCircle, Minus, Sheet,
};

const DEFAULT_ATTRS = { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" };

const escapeAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const attrsToString = (attrs) => Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ");

function renderNode([tag, attrs, children]) {
  const inner = children && children.length ? children.map(renderNode).join("") : "";
  return `<${tag} ${attrsToString(attrs)}>${inner}</${tag}>`;
}

/**
 * Render a Lucide icon (by name, or an icon node array) to an inline SVG string.
 * icon("BookOpen", { size: 18, cls: "nav-ico-svg", strokeWidth: 1.9, title: "Courses" })
 */
export function icon(nameOrNode, opts = {}) {
  const node = typeof nameOrNode === "string" ? ICONS[nameOrNode] : nameOrNode;
  if (!node) {
    console.warn(`[icons] Unknown icon "${nameOrNode}"`);
    return icon(CircleAlert, { ...opts, cls: (opts.cls || "") + " icon-missing" });
  }
  const { size = 20, cls = "", strokeWidth = 1.8, title } = opts;
  const attrs = {
    ...DEFAULT_ATTRS,
    width: size,
    height: size,
    "stroke-width": strokeWidth,
    class: cls || undefined,
    "aria-hidden": title ? undefined : "true",
    role: title ? "img" : undefined,
  };
  Object.keys(attrs).forEach((k) => attrs[k] === undefined && delete attrs[k]);
  const titleTag = title ? `<title>${escapeAttr(title)}</title>` : "";
  const inner = node.map(renderNode).join("");
  return `<svg ${attrsToString(attrs)}>${titleTag}${inner}</svg>`;
}

export const hasIcon = (name) => name in ICONS;
